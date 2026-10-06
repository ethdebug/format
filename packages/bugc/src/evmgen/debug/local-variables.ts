/**
 * Local-variable debug info: a per-instruction snapshot of the locals
 * in scope, on two independent axes.
 *
 *  - LIST (which variables appear) = LEXICAL SCOPE. Each declaration
 *    (a parameter, or a `let`) is in scope over its source interval: a
 *    `let` from its declaration to the end of its declaring scope, a
 *    parameter throughout its function. Where several declarations of
 *    one name are in scope, the innermost one is listed, and it hides
 *    a storage variable of the same name. Stamped on every
 *    instruction and terminator, and on each block's entry, except the
 *    return sequence's frame teardown (`withoutFrameLocals`). Inlined
 *    code lists only the inlined callee's locals (see
 *    `Instruction.Debug.inlineSites`).
 *  - POINTER (value vs type-only) = AVAILABILITY. A pointer is given
 *    only from the listed declaration's own versions: the current one
 *    (the deepest whose definition dominates the instruction), where
 *    its value is in memory (its home) or, during code generation, on
 *    the stack (`withStackLocals`). Contexts are postconditions, so an
 *    instruction that defines a memory-homed version lists it only on
 *    the MSTORE that homes it.
 *
 * Optimization can fold a version to a constant or remove it. The
 * current version is then decided where the instruction was before
 * optimization (its `origin`), among all versions: where that is a
 * removed version, the local is listed without a pointer, never with
 * a stale value. The format has no form yet for "the value is this
 * expression" (ethdebug/format#291), so a folded value cannot be
 * stated either.
 *
 * A reference-typed local (memory array, string, dynamic bytes) is
 * held as an address word; its pointer names that word, then the data
 * it refers to (`dataPointers`).
 *
 * The memory pointer encodes bugc's frame convention: the frame base
 * lives in memory at `FRAME_POINTER` (0x80); a frame-homed local is at
 * `mem[ mem[FRAME_POINTER] + delta ]`, expressed as a `group` naming
 * the frame region `-frame` (no BUG identifier starts with `-`) and a
 * data region whose offset reads it (`$read`) and adds the static
 * delta (`$sum`). Functions without a frame (main/create) home locals
 * at a static memory offset.
 */
import type * as Format from "@ethdebug/format";

import * as Ir from "#ir";
import { Type as BugType } from "#types";
import { Memory } from "#evmgen/analysis";
import { convertToEthDebugType } from "../../irgen/debug/types.js";
import { fromBugType } from "../../irgen/type.js";

type VariableEntry = Format.Program.Context.Variables["variables"][number];

/** The frame pointer's region; not a BUG identifier, so no local's */
const FRAME = "-frame";
type StackLocal = NonNullable<Ir.Instruction.Debug["stackLocals"]>[number];

type DefSite = Ir.Utils.DefSite;

/**
 * A value is homed by a full-word `MSTORE` of its stack word, which
 * writes the word big-endian. bugc keeps every scalar right-aligned on
 * the stack (`bytesN` included), so a scalar of `size` bytes is the
 * word's low-order `size` bytes: `32 - size` bytes into the word,
 * `size` bytes long. The same holds for a stack slot (segment offsets
 * count from the word's most significant byte).
 */
function memoryPointer(
  identifier: string,
  size: number,
  allocation: Memory.Allocation,
  frameSize: number | undefined,
): Format.Pointer {
  const offset = Number(allocation.offset) + 32 - size;

  if (frameSize === undefined) {
    // No call frame (main/create): static memory offset.
    return { name: identifier, location: "memory", offset, length: size };
  }

  // Frame-relative: mem[ mem[FRAME_POINTER] + delta ].
  return {
    group: [
      {
        name: FRAME,
        location: "memory",
        offset: Memory.regions.FRAME_POINTER,
        length: 32,
      },
      {
        name: identifier,
        location: "memory",
        offset: { $sum: [{ $read: FRAME }, offset] },
        length: size,
      },
    ],
  };
}

function stackPointer(
  identifier: string,
  slot: number,
  size: number,
): Format.Pointer {
  return {
    name: identifier,
    location: "stack",
    slot,
    ...(size < 32 ? { offset: 32 - size, length: size } : {}),
  };
}

/**
 * Pointers to the data a reference at `base` refers to, by bugc's
 * memory layout, or undefined if the layout is not described here.
 *
 * - `string` and dynamic `bytes`: a length word at `base`, then that
 *   many bytes of data.
 * - dynamic array: a length word at `base`, then one word per element
 *   (`base + 32 + 32 * i`). A scalar element is right-aligned in its
 *   word; a reference element's word holds the address of its data,
 *   described the same way.
 *
 * Regions are named after the local: `x-length`, `x-data`,
 * `x-element`, and for a nested reference `x-element-length` and so
 * on. Fixed-size arrays and structs are left out: bugc cannot build
 * one in memory yet (no struct literal; array literals are dynamic).
 */
function dataPointers(
  base: Format.Pointer.Expression,
  type: Ir.Type.Origin,
  name: string,
  depth: number = 0,
): Format.Pointer[] | undefined {
  if (type === "synthetic") return undefined;
  const length: Format.Pointer = {
    name: `${name}-length`,
    location: "memory",
    offset: base,
    length: 32,
  };

  if (
    BugType.isElementary(type) &&
    (BugType.Elementary.isString(type) ||
      (BugType.Elementary.isBytes(type) && type.size === undefined))
  ) {
    return [
      length,
      {
        name: `${name}-data`,
        location: "memory",
        offset: { $sum: [base, 32] },
        length: { $read: `${name}-length` },
      },
    ];
  }

  if (!BugType.isArray(type) || type.size !== undefined) return undefined;

  const index = `i${depth}`;
  const element = `${name}-element`;
  const wordOffset = (within: number): Format.Pointer.Expression => ({
    $sum: [base, 32 + within, { $product: [index, 32] }],
  });
  const elementType = fromBugType(type.element);
  let is: Format.Pointer;
  if (Ir.Type.isScalar(elementType)) {
    const size = elementType.size;
    is = {
      name: element,
      location: "memory",
      offset: wordOffset(32 - size),
      length: size,
    };
  } else {
    const nested = dataPointers(
      { $read: element },
      type.element,
      element,
      depth + 1,
    );
    if (!nested) return undefined;
    is = {
      group: [
        {
          name: element,
          location: "memory",
          offset: wordOffset(0),
          length: 32,
        },
        ...nested,
      ],
    };
  }

  return [
    length,
    { list: { count: { $read: `${name}-length` }, each: index, is } },
  ];
}

/** A pointer to a local's word plus, for a reference, its data. */
function withData(
  word: Format.Pointer,
  data: Format.Pointer[] | undefined,
): Format.Pointer {
  if (!data) return word;
  return "group" in word
    ? { group: [...word.group, ...data] }
    : { group: [word, ...data] };
}

/**
 * One declaration of a local: its versions, and the source interval
 * over which it is in scope.
 */
interface Declaration {
  name: string;
  /** The inline site whose code lists it (undefined: the function's) */
  site: string | undefined;
  versions: Ir.Function.SsaVariable[];
  /** Where the declaration is, for the entry's `declaration` */
  loc: Ir.Function.SsaVariable["loc"];
  start: number;
  end: number;
}

/** Group a function's versions by declaration. */
function declarations(func: Ir.Function): Declaration[] {
  const groups = new Map<string, Ir.Function.SsaVariable[]>();
  for (const ssa of func.ssaVariables!.values()) {
    const key = [ssa.inlineSite ?? "", ssa.name, ssa.declaredIn ?? ""].join(
      "/",
    );
    const list = groups.get(key);
    if (list) list.push(ssa);
    else groups.set(key, [ssa]);
  }
  return [...groups.values()].map((versions) => {
    const { name, inlineSite, declaredIn, scopeEnd } = versions[0];
    const loc = versions.find((v) => v.loc)?.loc;
    // A parameter is in scope throughout its function; a `let` from
    // its declaration to the end of the scope that declares it.
    const [scopeStart] = (declaredIn ?? "").split(":").map(Number);
    const param = scopeEnd === undefined;
    return {
      name,
      site: inlineSite,
      versions,
      loc,
      start: param
        ? -Infinity
        : loc
          ? Number(loc.offset)
          : (scopeStart ?? -Infinity),
      end: param ? Infinity : scopeEnd,
    };
  });
}

/** Identifier + type + declaration of a local. */
function buildEntry(
  declaration: Declaration,
  type: Ir.Type,
  sourceId: string,
): VariableEntry {
  const entry: VariableEntry = { identifier: declaration.name };

  const converted = convertToEthDebugType(type);
  if (converted) entry.type = converted;

  if (declaration.loc) {
    entry.declaration = {
      source: { id: sourceId },
      range: declaration.loc,
    };
  }

  return entry;
}

/**
 * Merge variable entries into an instruction's debug context as a
 * flat `variables` sibling, alongside any existing `variables` (the
 * storage variables from irgen) and preserving all other keys. A local
 * in scope hides a storage variable of the same name.
 */
function withVariables(
  debug: Ir.Instruction.Debug | undefined,
  entries: VariableEntry[],
  stackLocals: StackLocal[],
): Ir.Instruction.Debug {
  const { stored: _, stackLocals: __, ...rest } = debug ?? {};
  if (entries.length === 0) return rest;

  const context = (rest.context ?? {}) as Record<string, unknown>;
  const locals = new Set(entries.map((e) => e.identifier));
  const storage = (
    Array.isArray(context.variables)
      ? (context.variables as VariableEntry[])
      : []
  ).filter((v) => !locals.has(v.identifier));

  return {
    ...rest,
    context: {
      ...context,
      variables: [...storage, ...entries],
    } as Format.Program.Context,
    ...(stackLocals.length > 0 ? { stackLocals } : {}),
  };
}

/**
 * Give each listed local whose temp is on the stack a stack pointer,
 * for an instruction just emitted with the stack as it is after it
 * (`stack[0]` is the top). Called as code generation emits each
 * instruction.
 */
export function withStackLocals<I extends { debug?: Ir.Instruction.Debug }>(
  instruction: I,
  stack: ReadonlyArray<{ irValue?: string }>,
): I {
  const debug = instruction.debug;
  if (!debug?.stackLocals) return instruction;

  const context = debug.context as Record<string, unknown>;
  const variables = (context.variables as VariableEntry[]).map((entry) => {
    const local = debug.stackLocals!.find(
      (l) => l.identifier === entry.identifier,
    );
    if (!local || entry.pointer) return entry;
    const slot = stack.findIndex((item) => item.irValue === local.temp);
    if (slot < 0) return entry;
    return {
      ...entry,
      pointer: withData(
        stackPointer(local.identifier, slot, local.size),
        local.data,
      ),
    };
  });
  return {
    ...instruction,
    debug: {
      ...debug,
      context: { ...context, variables } as Format.Program.Context,
    },
  };
}

/**
 * Drop a function's locals from a debug context, for the instructions
 * that tear its frame down. Once the caller's frame pointer is
 * restored, a frame-relative pointer names the caller's words, and the
 * function's locals are out of scope. A local is an entry with a
 * frame-relative pointer or none (type-only, or on the stack); other
 * entries (storage) stay.
 */
export function withoutFrameLocals(
  debug: Ir.Instruction.Debug,
): Ir.Instruction.Debug {
  const context = debug.context as Record<string, unknown> | undefined;
  if (!context || !Array.isArray(context.variables)) return debug;

  const isLocal = (entry: VariableEntry) =>
    !entry.pointer ||
    ("group" in entry.pointer &&
      (entry.pointer.group[0] as { name?: string }).name === FRAME);
  const variables = (context.variables as VariableEntry[]).filter(
    (entry) => !isLocal(entry),
  );

  const rest = Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== "variables"),
  );
  const { stackLocals: _, stored: __, ...others } = debug;
  return {
    ...others,
    context: (variables.length > 0
      ? { ...rest, variables }
      : rest) as Format.Program.Context,
  };
}

/** The source offsets of an instruction/terminator: of its `code`
 * context, or of each `code` in a `gather` (all of which apply). */
function codeOffsets(context: unknown): number[] {
  if (!context || typeof context !== "object") return [];
  const { code, gather } = context as {
    code?: { range?: { offset?: unknown } };
    gather?: unknown[];
  };
  const offset = code?.range?.offset;
  return [
    ...(offset == null ? [] : [Number(offset)]),
    ...(Array.isArray(gather) ? gather.flatMap(codeOffsets) : []),
  ];
}

/**
 * Among versions with a def site, the current one at (block, index):
 * the deepest whose def dominates it. Undefined if none does yet.
 */
function currentVersion<V>(
  versions: Array<{ version: V; def: DefSite }>,
  block: string,
  index: number,
  idom: Record<string, string | null>,
): V | undefined {
  let best: { version: V; def: DefSite } | undefined;
  for (const candidate of versions) {
    const { def } = candidate;
    if (!Ir.Utils.dominates(def, block, index, idom)) continue;
    const later =
      !best ||
      (def.block === best.def.block
        ? def.index > best.def.index
        : Ir.Utils.dominatesBlock(best.def.block, def.block, idom));
    if (later) best = candidate;
  }
  return best?.version;
}

/** What the snapshot needs to know about one function. */
interface FunctionInfo {
  declarations: Declaration[];
  /** The temp holding each version's value */
  tempOf: Map<Ir.Function.SsaVariable, string>;
  defs: Map<string, DefSite>;
  idom: Record<string, string | null>;
  origins: Ir.Function["origins"];
  allocations: Record<string, Memory.Allocation>;
  frameSize: number | undefined;
  sourceId: string;
}

/** A position, after optimization and (if known) before it */
interface Position {
  block: string;
  index: number;
  origin?: Ir.Function.Origin;
}

/**
 * The version of a declaration whose value is current at `at`, if its
 * value is located there; undefined if not.
 *
 * With the position before optimization known, the current version is
 * decided there, among all versions: if it is one the optimizer
 * removed, there is no value to point to. Without it, a declaration
 * with any removed or aliasing version gets no pointer.
 */
function locatedVersion(
  info: FunctionInfo,
  declaration: Declaration,
  at: Position,
): { ssa: Ir.Function.SsaVariable; temp: string } | undefined {
  const defined = (ssa: Ir.Function.SsaVariable) =>
    info.defs.get(info.tempOf.get(ssa)!);
  const versions = declaration.versions.filter((v) => !v.placeholder);

  let current: Ir.Function.SsaVariable | undefined;
  const { origin } = at;
  const idom = origin && info.origins?.get(origin.function);
  if (
    origin &&
    idom &&
    versions.every((v) => v.origin?.function === origin.function)
  ) {
    current = currentVersion(
      versions.map((version) => ({ version, def: version.origin! })),
      origin.block,
      origin.index,
      idom,
    );
  } else {
    // Without the position before optimization, a removed version, or
    // one defined apart from its temp, cannot be placed
    if (versions.some((v) => !defined(v) || v.defined)) return undefined;
    current = currentVersion(
      versions.map((version) => ({ version, def: defined(version)! })),
      at.block,
      at.index,
      info.idom,
    );
  }

  const def = current && defined(current);
  if (!def || !Ir.Utils.dominates(def, at.block, at.index, info.idom)) {
    return undefined;
  }
  return { ssa: current!, temp: info.tempOf.get(current!)! };
}

/**
 * The snapshot at `at` with source `offsets`, for code inlined through
 * `site` (undefined: the function's own code). LIST axis: for each
 * name, the innermost declaration in scope (name + type). POINTER
 * axis: its current version, if located, gets a memory pointer if
 * memory-homed, else is left for the stack.
 */
function snapshotAt(
  info: FunctionInfo,
  at: Position,
  offsets: number[],
  site: string | undefined,
  overwritten: Set<string>,
): { entries: VariableEntry[]; stackLocals: StackLocal[] } {
  const inScope = (d: Declaration) =>
    offsets.length === 0 ||
    offsets.some((offset) => offset >= d.start && offset < d.end);

  const listed = new Map<string, Declaration>();
  for (const declaration of info.declarations) {
    if (declaration.site !== site || !inScope(declaration)) continue;
    const other = listed.get(declaration.name);
    if (!other || declaration.start > other.start) {
      listed.set(declaration.name, declaration);
    }
  }

  const entries: VariableEntry[] = [];
  const stackLocals: StackLocal[] = [];
  for (const declaration of listed.values()) {
    const found = locatedVersion(info, declaration, at);
    const located = found && !overwritten.has(found.temp) ? found : undefined;
    const type = (located?.ssa ?? declaration.versions[0]).type;
    const entry = buildEntry(declaration, type, info.sourceId);
    entries.push(entry);
    if (!located) continue;

    // A scalar's word holds its value; a reference's word holds the
    // address of its data.
    const { name } = declaration;
    let size = 32;
    let data: Format.Pointer[] | undefined;
    if (Ir.Type.isScalar(type)) {
      size = type.size;
    } else {
      if (type.kind !== "ref" || type.location !== "memory") continue;
      data = dataPointers({ $read: name }, type.origin, name);
      if (!data) continue;
    }
    const allocation = info.allocations[located.temp];
    if (allocation) {
      entry.pointer = withData(
        memoryPointer(name, size, allocation, info.frameSize),
        data,
      );
    } else {
      stackLocals.push({
        identifier: name,
        temp: located.temp,
        size,
        ...(data ? { data } : {}),
      });
    }
  }
  return { entries, stackLocals };
}

/**
 * Stamp every instruction and terminator of a function, and each
 * block's entry, with its variable snapshot.
 */
function enrichFunction(
  func: Ir.Function,
  module: Ir.Module,
  memory: Memory.Function.Info,
  sourceId: string,
): void {
  if (!func.ssaVariables || func.ssaVariables.size === 0) return;

  const tempOf = new Map<Ir.Function.SsaVariable, string>();
  for (const [key, ssa] of func.ssaVariables) {
    tempOf.set(ssa, ssa.temp ?? key);
  }

  const info: FunctionInfo = {
    declarations: declarations(func),
    tempOf,
    defs: Ir.Utils.defSites(func),
    idom: new Ir.Analysis.Statistics.Analyzer().analyze({
      ...module,
      main: func,
    }).dominatorTree,
    origins: func.origins,
    allocations: memory.allocations,
    frameSize: memory.frameSize,
    sourceId,
  };
  const homed = new Set(
    [...tempOf.values()].filter((t) => info.allocations[t] !== undefined),
  );

  // Carry the last known source offsets forward (function-wide) so
  // synthesized ops without a `code` context inherit a nearby scope.
  let lastOffsets: number[] = [];
  const stamp = (
    debug: Ir.Instruction.Debug | undefined,
    block: string,
    index: number,
    // Shift the position back (-1: just before this instruction)
    shift: number = 0,
    // Temps whose homes the instruction's code overwrites
    overwritten: Set<string> = new Set(),
  ): Ir.Instruction.Debug => {
    const own = codeOffsets(debug?.context);
    const offsets = own.length > 0 ? own : lastOffsets;
    lastOffsets = offsets;
    const origin = debug?.origin && {
      ...debug.origin,
      index: debug.origin.index + shift,
    };
    const { entries, stackLocals } = snapshotAt(
      info,
      { block, index: index + shift, origin },
      offsets,
      debug?.inlineSites?.at(-1),
      overwritten,
    );
    return withVariables(debug, entries, stackLocals);
  };

  // A call's memory-homed result is on the stack at its continuation's
  // entry, and in its home only once spilled.
  const spilled = new Map<string, string>();
  for (const block of func.blocks.values()) {
    const term = block.terminator;
    if (term.kind === "call" && term.dest && homed.has(term.dest)) {
      spilled.set(term.continuation, term.dest);
    }
  }

  for (const [blockId, block] of func.blocks) {
    // The block's entry: just before its first instruction (or its
    // terminator), with that instruction's scope and inline site.
    const first = block.instructions[0] ?? block.terminator;
    const result = spilled.get(blockId);
    const entry = stamp(
      first.operationDebug,
      blockId,
      0,
      -1,
      new Set(result ? [result] : []),
    );
    const { variables } = (entry.context ?? {}) as { variables?: unknown };
    block.entryDebug = variables
      ? {
          context: { variables } as Format.Program.Context,
          ...(entry.stackLocals ? { stackLocals: entry.stackLocals } : {}),
        }
      : {};

    block.instructions.forEach((inst, i) => {
      const debug = inst.operationDebug;
      // An instruction that defines a memory-homed local computes its
      // value before the MSTORE that homes it. Contexts are
      // postconditions, so the instruction's ops carry the snapshot
      // from before the def, and only the store carries the snapshot
      // that locates the new value.
      if (!("dest" in inst) || !homed.has(inst.dest as string)) {
        inst.operationDebug = stamp(debug, blockId, i);
        return;
      }
      const stored = stamp(debug, blockId, i);
      inst.operationDebug = { ...stamp(debug, blockId, i, -1), stored };
    });
    // The terminator's position is after all instructions in the block.
    const term = block.terminator;
    if (!term) continue;
    const debug = term.operationDebug;
    // A jump into a block with phis first copies the phis' values into
    // their homes; a local whose current version is one of those phis
    // would read the next value early, so it has no pointer here.
    const phis = term.kind === "jump" ? func.blocks.get(term.target)?.phis : [];
    term.operationDebug = stamp(
      debug,
      blockId,
      block.instructions.length,
      0,
      new Set((phis ?? []).map((phi) => phi.dest)),
    );
    // A call's memory-homed result is spilled when its continuation
    // begins; that store carries the continuation's snapshot.
    if (term.kind === "call" && term.dest && homed.has(term.dest)) {
      const { origin: __, ...unplaced } = debug ?? {};
      term.operationDebug.stored = stamp(unplaced, term.continuation, -1);
    }
  }
}

/**
 * Enrich a module's instructions with per-instruction local-variable
 * snapshots. Mutates in place; safe before generation.
 */
export function enrich(
  module: Ir.Module,
  memory: Memory.Module.Info,
): Ir.Module {
  const sourceId = module.sourceId;

  const targets: { func: Ir.Function; mem?: Memory.Function.Info }[] = [
    { func: module.main, mem: memory.main },
    ...(module.create ? [{ func: module.create, mem: memory.create }] : []),
    ...[...module.functions].map(([name, func]) => ({
      func,
      mem: memory.functions[name],
    })),
  ];

  for (const { func, mem } of targets) {
    if (!mem) continue;
    enrichFunction(func, module, mem, sourceId);
  }

  return module;
}
