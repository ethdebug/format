/**
 * A pointer that refers to shared templates must read what bugc's
 * pointers read before they referred to templates. Every listed
 * variable's pointer is read at every step of a run of an example:
 *
 * - For every example, at every level, both ways: with the
 *   compilation's templates, and inline (each reference replaced by its
 *   template's pointer, regions renamed as the reference's `yields`
 *   says). The two must give the same regions with the same bytes.
 * - For some examples, at O0 and O2, the reads must be those of bugc
 *   before templates (origin/main at 9c8d7ccb1, all inline pointers):
 *   `templates.golden.json` holds the number of reads and a digest of
 *   them. `UPDATE_TEMPLATES_GOLDEN=1` writes it again from the
 *   compiler at hand, so it is written with a compiler from before.
 */
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import * as Format from "@ethdebug/format";
import { createMachineState } from "@ethdebug/evm";
import { dereference, type Data, type Machine } from "@ethdebug/pointers";

import { localsOf, traceLocals } from "#test/evm/locals";
import { parseTestBlocks } from "#test/examples/annotations";

import type { Templates } from "./templates.js";

const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples");
const levels = [0, 1, 2, 3] as const;

/** Keys whose (string) value names a region */
const regionKeys = new Set(["name", "~read", ".offset", ".length", ".slot"]);

/** A pointer with its regions, and references to them, renamed */
function rename(value: unknown, renames: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => rename(v, renames));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      regionKeys.has(key) && typeof v === "string" && v in renames
        ? renames[v]
        : rename(v, renames),
    ]),
  );
}

/**
 * A pointer with each reference to a template in `templates` replaced
 * by the template's pointer, renamed by the reference's `yields`.
 * References to templates a pointer defines inline (`local`) stay.
 */
function inline(
  pointer: Format.Pointer,
  templates: Templates,
  local: Set<string> = new Set(),
): Format.Pointer {
  const within = (p: Format.Pointer) => inline(p, templates, local);
  if (Format.Pointer.isRegion(pointer)) return pointer;
  if ("group" in pointer) return { group: pointer.group.map(within) };
  if ("list" in pointer) {
    return { list: { ...pointer.list, is: within(pointer.list.is) } };
  }
  if ("if" in pointer) {
    return {
      ...pointer,
      then: within(pointer.then),
      ...(pointer.else ? { else: within(pointer.else) } : {}),
    };
  }
  if ("define" in pointer) {
    return { define: pointer.define, in: within(pointer.in) };
  }
  if ("templates" in pointer) {
    const names = new Set([...local, ...Object.keys(pointer.templates)]);
    return {
      templates: Object.fromEntries(
        Object.entries(pointer.templates).map(([name, template]) => [
          name,
          { ...template, for: inline(template.for, templates, names) },
        ]),
      ),
      in: inline(pointer.in, templates, names),
    };
  }
  if (local.has(pointer.template)) return pointer;
  return rename(
    within(templates[pointer.template].for),
    pointer.yields ?? {},
  ) as Format.Pointer;
}

/** A pointer's regions at a state, with their bytes */
async function read(
  pointer: Format.Pointer,
  state: Machine.State,
  templates: Templates,
): Promise<unknown> {
  try {
    const view = await (
      await dereference(pointer, { state, templates })
    ).view(state);
    const regions = [];
    for (const region of view.regions) {
      const at = (["slot", "offset", "length"] as const).map((key) => [
        key,
        (region as Partial<Record<typeof key, Data>>)[key]?.toHex(),
      ]);
      regions.push({
        name: region.name,
        location: region.location,
        ...Object.fromEntries(at),
        bytes: (await view.read(region)).toHex(),
      });
    }
    return regions;
  } catch (error) {
    // (a trace holds only the storage it touched)
    return { error: (error as Error).message };
  }
}

/** The calldata to run an example with: none, and its tests' */
function calldataOf(source: string): string[] {
  return [
    ...new Set([
      "",
      ...parseTestBlocks(source).flatMap(({ parsed }) =>
        parsed.callData ? [parsed.callData] : [],
      ),
    ]),
  ];
}

/**
 * Visit each listed variable's pointer, at the state after each step of
 * a run of `source` with each of its calldata (contexts are
 * postconditions), then each storage variable's, with the storage after
 * the call. Visits are in order, labeled with the run and step.
 */
async function eachPointer(
  source: string,
  level: (typeof levels)[number],
  visit: (
    label: string,
    pointer: Format.Pointer,
    state: Machine.State,
    templates: Templates,
  ) => Promise<void>,
): Promise<void> {
  for (const calldata of calldataOf(source)) {
    const run = await traceLocals(source, level, calldata);
    // (bugc gave no templates before)
    const templates = run.templates ?? {};
    for (let k = 0; k + 1 < run.steps.length; k++) {
      const context = run.instructionAt(run.steps[k])?.context;
      const entries = localsOf(context).filter(({ pointer }) => pointer);
      if (entries.length === 0) continue;
      const state = run.stateAt(k + 1);
      // (give the event loop a turn; see `afterEach` below)
      await new Promise<void>((resolve) => setImmediate(resolve));
      for (const { identifier, pointer } of entries) {
        const label = `${calldata.slice(0, 8)} ${k} ${identifier}`;
        await visit(label, pointer as Format.Pointer, state, templates);
      }
    }
    const state = createMachineState(await run.executor.currentState());
    for (const { identifier, pointer } of localsOf(run.program.context)) {
      if (!pointer) continue;
      const label = `${calldata.slice(0, 8)} end ${identifier}`;
      await visit(label, pointer as Format.Pointer, state, templates);
    }
  }
}

// A long run of reads never turns the event loop, so the worker cannot
// read vitest's replies to its progress reports, and once that lasts a
// minute, vitest fails the run with 'Timeout calling "onTaskUpdate"'
// (as in test/examples/examples.test.ts).
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));

async function examples(): Promise<Array<[string, string]>> {
  const files = await glob("**/*.bug", { cwd: EXAMPLES_DIR });
  const sources: Array<[string, string]> = [];
  for (const file of files.sort()) {
    const source = await fs.readFile(path.join(EXAMPLES_DIR, file), "utf-8");
    if (!/\/\/ @(wip|skip|expect-)/.test(source)) sources.push([file, source]);
  }
  return sources;
}

describe("pointers that refer to templates read as written out", async () => {
  for (const [file, source] of await examples()) {
    for (const level of levels) {
      it(`${file} at O${level}`, async () => {
        let pointers = 0;
        let reads = 0;
        await eachPointer(source, level, async (_, pointer, state, t) => {
          const read_ = await read(pointer, state, t);
          expect(read_).toEqual(await read(inline(pointer, t), state, {}));
          pointers++;
          if (Array.isArray(read_)) reads++;
        });
        // (not all failing alike)
        if (pointers > 0) expect(reads).toBeGreaterThan(0);
      }, 60_000);
    }
  }
});

const GOLDEN = path.join(__dirname, "templates.golden.json");
const goldenExamples = [
  "advanced/nested-arrays.bug",
  "advanced/nested-structs.bug",
  "advanced/token-registry.bug",
  "basic/functions.bug",
  "intermediate/mappings.bug",
  "intermediate/memory-arrays.bug",
  "intermediate/pointer-shapes.bug",
  "intermediate/strings.bug",
];

describe("pointers read as they did before templates", async () => {
  const update = !!process.env.UPDATE_TEMPLATES_GOLDEN;
  const golden: Record<string, { reads: number; digest: string }> = update
    ? {}
    : JSON.parse(await fs.readFile(GOLDEN, "utf-8"));
  if (update) {
    afterAll(() =>
      fs.writeFile(GOLDEN, JSON.stringify(golden, null, 2) + "\n"),
    );
  }

  for (const file of goldenExamples) {
    for (const level of [0, 2] as const) {
      const key = `${file} at O${level}`;
      it(
        key,
        async () => {
          const source = await fs.readFile(
            path.join(EXAMPLES_DIR, file),
            "utf-8",
          );
          const hash = createHash("sha256");
          let reads = 0;
          await eachPointer(source, level, async (label, pointer, state, t) => {
            const read_ = await read(pointer, state, t);
            hash.update(JSON.stringify([label, read_]) + "\n");
            if (Array.isArray(read_)) reads++;
          });
          const actual = { reads, digest: hash.digest("hex") };
          expect(reads).toBeGreaterThan(0);
          if (update) golden[key] = actual;
          else expect(actual).toEqual(golden[key]);
        },
        60_000,
      );
    }
  }
});
