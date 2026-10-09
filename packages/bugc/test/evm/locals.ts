/**
 * Support for tests of local-variable debug info: compile, run with a
 * full trace, and read each listed local's pointer with
 * @ethdebug/pointers `dereference` against the machine state after
 * each step (contexts are postconditions).
 */
import { expect } from "vitest";
import { compile } from "#compiler";
import {
  Executor,
  createMachineState,
  createTrace,
  type Trace,
  type TraceStep,
} from "@ethdebug/evm";
import { dereference, type Machine } from "@ethdebug/pointers";
import { bytesToHex } from "ethereum-cryptography/utils";
import type * as Format from "@ethdebug/format";

export type Level = 0 | 1 | 2 | 3;

export interface LocalsTrace {
  program: Format.Program;
  executor: Executor;
  trace: Trace;
  steps: readonly TraceStep[];
  /** The machine state at a step (before its instruction runs) */
  stateAt(index: number): Machine.State;
  /** The program's instruction at a step's pc */
  instructionAt(step: TraceStep): Format.Program.Instruction | undefined;
}

/** Compile (at O0 by default) and run once, with `calldata` (hex, no
 * 0x), keeping every step. */
export async function traceLocals(
  source: string,
  level: Level = 0,
  calldata: string = "",
): Promise<LocalsTrace> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });
  if (!result.success) throw new Error("compile failed");
  const bytecode = result.value.bytecode;
  const executor = new Executor();
  await executor.deploy(
    bytesToHex(
      bytecode.create && bytecode.create.length > 0
        ? bytecode.create
        : bytecode.runtime,
    ),
  );
  const trace = createTrace();
  await executor.execute({ data: calldata }, trace);

  const program = bytecode.runtimeProgram;
  const byOffset = new Map(
    program.instructions.map((i) => [Number(i.offset), i]),
  );
  return {
    program,
    executor,
    trace,
    steps: trace.steps,
    stateAt: (index) => createMachineState(trace.stateAt(index)),
    instructionAt: (step) => byOffset.get(step.pc),
  };
}

/** The `variables` entries of a context. */
export function localsOf(context: unknown): Array<Record<string, unknown>> {
  if (!context || typeof context !== "object") return [];
  const variables = (context as { variables?: unknown }).variables;
  return Array.isArray(variables)
    ? (variables as Array<Record<string, unknown>>)
    : [];
}

/** The layout of a reference-typed local, for reading its pointer */
export type Shape =
  | { kind: "bytes" }
  | { kind: "calldata" }
  | { kind: "array"; element: Shape | { kind: "scalar"; size: number } };

/** A reference's value as its regions read it: hex for bytes and
 * strings, an array of bigints (or nested arrays) for arrays. */
export type RefValue = string | bigint | RefValue[];

/** A value a local takes, and (optionally) the source text of the
 * statement that gives it: the value may be read only once that
 * statement has run (as many times as the value is listed after it). */
export type Value = RefValue | { value: RefValue; after: string };

export interface Local {
  /** The values the local takes, in execution order */
  values: Value[];
  /** A scalar's size in bytes (default 32) */
  size?: number;
  /** A reference's layout */
  shape?: Shape;
  /** Must be located at every level, not just at O0 */
  everyLevel?: boolean;
}

export interface LocalsProgram {
  name: string;
  source: string;
  /**
   * By local: its name, or `name@text` for one of several
   * declarations of a name, where `text` is source text within that
   * declaration.
   */
  locals: Record<string, Local>;
  /** The levels to check at, if not all */
  levels?: Level[];
  /** The calldata to run with (hex, no 0x), if any */
  calldata?: string;
}

/**
 * Run a program at a level and check every listed local: at each step
 * that lists a local with a pointer, the state after the step must
 * hold one of the local's values, read through the pointer region by
 * region against memory: not earlier than the last value read or the
 * latest one whose statement has finished, and not one whose statement
 * has not run yet. A listed local the program does not expect fails.
 * At O0 (or every level, if so marked), every local must be located at
 * some step.
 */
export async function check(
  { source, locals, calldata }: LocalsProgram,
  level: Level,
): Promise<void> {
  const run = await traceLocals(source, level, calldata);
  const { steps } = run;

  // The declaration each key names: an offset in the source
  const keys = Object.keys(locals).map((key) => {
    const [name, text] = key.split("@");
    const at = text === undefined ? undefined : source.indexOf(text);
    if (at !== undefined && at < 0) throw new Error(`no "${text}" in source`);
    return { key, name, at };
  });
  const keyOf = (entry: Record<string, unknown>): string | undefined => {
    const range = (
      entry.declaration as { range?: { offset: number; length: number } }
    )?.range;
    return keys.find(
      ({ name, at }) =>
        name === entry.identifier &&
        (at === undefined ||
          (range !== undefined &&
            at >= range.offset &&
            at < range.offset + range.length)),
    )?.key;
  };

  // How often the statement giving each value has run so far
  const statements = [
    ...new Set(
      Object.values(locals).flatMap((local) =>
        local.values.flatMap((v) =>
          typeof v === "object" && v !== null && "after" in v ? [v.after] : [],
        ),
      ),
    ),
  ].map((text) => {
    const offset = source.indexOf(text);
    if (offset < 0) throw new Error(`no "${text}" in source`);
    return { text, offset, end: offset + text.length };
  });
  // A statement runs while an instruction within it executes, and has
  // finished a run when execution leaves it
  const runs = new Map<string, number>();
  const finished = new Map<string, number>();
  let inside = new Set<string>();

  /** The values of a local, with the ordinal of each among the values
   * its statement gives */
  const valuesOf = (local: Local) => {
    const seen = new Map<string, number>();
    return local.values.map((v) => {
      const { value, after } =
        typeof v === "object" && v !== null && "after" in v
          ? v
          : { value: v, after: undefined };
      const run =
        after === undefined
          ? 0
          : (seen.set(after, (seen.get(after) ?? 0) + 1), seen.get(after)!);
      return { value, after, run };
    });
  };

  const at: Record<string, number> = {};
  for (let k = 0; k + 1 < steps.length; k++) {
    const context = run.instructionAt(steps[k])?.context;
    const ranges = codeRanges(context);
    const now = new Set(
      statements
        .filter((s) => ranges.some(([o, e]) => o >= s.offset && e <= s.end))
        .map((s) => s.text),
    );
    for (const text of now) {
      if (!inside.has(text)) runs.set(text, (runs.get(text) ?? 0) + 1);
    }
    for (const text of inside) {
      if (!now.has(text)) finished.set(text, (finished.get(text) ?? 0) + 1);
    }
    inside = now;

    for (const entry of localsOf(context)) {
      const pointer = entry.pointer as Record<string, unknown> | undefined;
      // A storage variable (a local's pointer is never into storage)
      if (!pointer || JSON.stringify(pointer).includes('"storage"')) continue;
      const name = entry.identifier as string;
      const key = keyOf(entry);
      const where = `after ${steps[k].opcode} at pc ${steps[k].pc}`;
      expect(key, `unexpected local ${name} ${where}`).toBeDefined();
      const local = locals[key!];

      const read = local.shape
        ? await readReference(pointer, name, local.shape, run, k + 1)
        : await readScalar(pointer, name, run, k + 1);

      // Never an earlier value than the last one read, nor than the
      // latest one whose statement has finished (that would be stale);
      // never a value whose statement has not run (that would be early)
      const values = valuesOf(local);
      const latest = values.reduce(
        (last, { after, run }, i) =>
          after !== undefined && (finished.get(after) ?? 0) >= run ? i : last,
        0,
      );
      const from = Math.max(at[key!] ?? 0, latest);
      const index = values.findIndex(({ value, after, run }, i) => {
        if (i < from) return false;
        if (after !== undefined && (runs.get(after) ?? 0) < run) return false;
        const expected =
          local.shape || typeof value !== "bigint"
            ? stringify(value)
            : hexBytes(value, local.size ?? 32);
        return expected === stringify(read);
      });
      expect(
        index,
        `${key} reads ${stringify(read)} ${where}; expected ` +
          values
            .slice(from)
            .map(({ value }) => stringify(value))
            .join(", "),
      ).toBeGreaterThanOrEqual(0);
      at[key!] = index;
    }
  }

  const required = Object.keys(locals).filter(
    (key) => level === 0 || locals[key].everyLevel,
  );
  expect(
    required.filter((key) => !(key in at)),
    `locals not located at O${level}`,
  ).toEqual([]);
}

/** The source ranges of a context's `code`, through `gather` */
function codeRanges(context: unknown): Array<[number, number]> {
  if (!context || typeof context !== "object") return [];
  const { code, gather } = context as {
    code?: { range?: { offset: number; length: number } };
    gather?: unknown[];
  };
  const range = code?.range;
  return [
    ...(range ? [[range.offset, range.offset + range.length]] : []),
    ...(Array.isArray(gather) ? gather.flatMap(codeRanges) : []),
  ] as Array<[number, number]>;
}

/** A value as the hex of `size` big-endian bytes. */
export function hexBytes(value: bigint, size = 32): string {
  return "0x" + value.toString(16).padStart(size * 2, "0");
}

/** Text as the hex of its UTF-8 bytes */
export function textBytes(value: string): string {
  return "0x" + Buffer.from(value).toString("hex");
}

function stringify(value: unknown): string {
  return typeof value === "string"
    ? value
    : JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? hexBytes(v).replace(/^0x0*/, "0x") : v,
      );
}

/**
 * Dereference a pointer at a step and read its regions in order,
 * checking each against the step's memory or the calldata.
 */
async function regionsAt(pointer: unknown, run: LocalsTrace, index: number) {
  const state = run.stateAt(index);
  const { memory, calldata } = run.trace.stateAt(index);
  const cursor = await dereference(pointer as Format.Pointer, { state });
  const view = await cursor.view(state);
  const regions = [...view.regions];
  let next = 0;
  return {
    /** Move to the region named `name` */
    seek(name: string) {
      next = regions.findIndex((r) => r.name === name);
      if (next < 0) throw new Error(`no region ${name}`);
    },
    /** Read the next region, which must be named `name` (and, in
     * memory or calldata, at `offset` and `size` bytes long, if
     * given) */
    async read(name: string, offset?: bigint, size?: bigint) {
      const region = regions[next++];
      if (!region || region.name !== name) {
        throw new Error(`expected region ${name}, got ${region?.name}`);
      }
      const data = await view.read(region);
      if (region.location === "memory" || region.location === "calldata") {
        const bytes = region.location === "memory" ? memory : calldata;
        const start = region.offset!.asUint();
        const length = region.length!.asUint();
        if (offset !== undefined && start !== offset) {
          throw new Error(`${name} at ${start}, expected ${offset}`);
        }
        if (size !== undefined && length !== size) {
          throw new Error(`${name} is ${length} bytes, expected ${size}`);
        }
        const actual = new Uint8Array(Number(length));
        actual.set(bytes.slice(Number(start), Number(start + length)));
        if (data.toHex() !== "0x" + bytesToHex(actual)) {
          throw new Error(
            `${name} does not read ${region.location} at ${start}`,
          );
        }
      }
      return data;
    },
  };
}

/** A scalar local's bytes (as hex) at a step */
async function readScalar(
  pointer: unknown,
  name: string,
  run: LocalsTrace,
  index: number,
): Promise<string> {
  const regions = await regionsAt(pointer, run, index);
  regions.seek(name);
  return (await regions.read(name)).toHex();
}

/**
 * A reference-typed local's value at a step, by its layout: the
 * local's word holds the base address, the length word is at the base,
 * each element is in its word (a scalar right-aligned), and the data
 * follows the length word, as long as the length says. Bytes in
 * calldata are the calldata from the offset in the word's high 16
 * bytes, as long as its low 16 bytes say.
 */
async function readReference(
  pointer: unknown,
  name: string,
  shape: Shape,
  run: LocalsTrace,
  index: number,
): Promise<RefValue> {
  const regions = await regionsAt(pointer, run, index);
  regions.seek(name);

  if (shape.kind === "calldata") {
    const word = (await regions.read(name)).asUint();
    const offset = word >> 128n;
    const length = word & ((1n << 128n) - 1n);
    return (await regions.read(`${name}-data`, offset, length)).toHex();
  }

  const decode = async (
    shape: Shape,
    prefix: string,
    base: bigint,
  ): Promise<RefValue> => {
    const length = (await regions.read(`${prefix}-length`, base, 32n)).asUint();
    if (shape.kind !== "array") {
      return (await regions.read(`${prefix}-data`, base + 32n, length)).toHex();
    }
    const element = shape.element;
    const values: RefValue[] = [];
    for (let i = 0n; i < length; i++) {
      const word = base + 32n + 32n * i;
      if (element.kind === "scalar") {
        const size = BigInt(element.size);
        const value = await regions.read(
          `${prefix}-element`,
          word + 32n - size,
          size,
        );
        values.push(value.asUint());
      } else {
        const address = (
          await regions.read(`${prefix}-element`, word, 32n)
        ).asUint();
        values.push(await decode(element, `${prefix}-element`, address));
      }
    }
    return values;
  };

  const base = (await regions.read(name)).asUint();
  return decode(shape, name, base);
}
