/**
 * Local-variable debug info (emission, O0) — per-instruction snapshot
 * splitting two independent axes:
 *
 *  - LIST (which variables appear) = LEXICAL SCOPE. Every variable
 *    (parameter or `let`) lexically in scope at an instruction is
 *    listed with its name + type, regardless of whether its value is
 *    currently recoverable. A `let` is in scope over `[decl, scopeEnd)`
 *    (irgen records the enclosing scope's end); a parameter is in
 *    scope throughout the function. Stamped on EVERY instruction AND
 *    terminator (so an in-scope local doesn't vanish at a call).
 *  - POINTER (value vs type-only) = AVAILABILITY by DOMINANCE. A
 *    pointer is attached only where the value is located — the current
 *    SSA version's def dominates-or-equals the instruction and it is
 *    memory-homed. Otherwise the record is type-only ("in scope, no
 *    value"). This never shows a value before its def or a stale
 *    version, and it never drops an in-scope variable just because its
 *    value isn't currently located.
 *
 * Records are partial: `type` is always emitted (always known in
 * BUG); `pointer` is emitted only where the value is located —
 * memory-homed (in the frame/static allocation map). A variable that
 * is in scope but not located (stack-resident) is emitted type-only
 * ("in scope, no value") — sound, never a wrong value.
 *
 * Scope (this cut): O0 only (under optimization locations move or
 * dissolve). Snapshot is stamped per instruction (redundant, accepted
 * for now). Pointers cover memory-homed locals; stack-resident are
 * type-only. Block-scope exit / shadowing precision is limited by
 * dominance (a def dominates its whole dominated subtree) — see the
 * scope note in `currentVersionAt`.
 *
 * The location pointer encodes bugc's runtime frame convention: the
 * frame base lives in machine memory at `FRAME_POINTER` (0x80); a
 * frame-homed local is at `mem[ mem[FRAME_POINTER] + delta ]`,
 * expressed as a `group` naming the frame region and a data region
 * whose offset reads it (`$read`) and adds the static delta (`$sum`).
 * Functions without a frame (main/create) home locals at a static
 * memory offset.
 */
import type * as Format from "@ethdebug/format";

import * as Ir from "#ir";
import { Memory } from "#evmgen/analysis";
import { convertToEthDebugType } from "../../irgen/debug/types.js";

type VariableEntry = Format.Program.Context.Variables["variables"][number];

/** Location of a definition: a block plus an instruction index
 * (`-1` = block entry, i.e. a parameter or phi, before all
 * instructions). */
interface DefSite {
  block: string;
  index: number;
}

/**
 * Build the location pointer for a memory-homed local. Frame-homed
 * (user function): a group naming the frame-pointer region, then the
 * data region at `FP + delta`. Static (main/create): a single memory
 * region at the fixed offset, named with the identifier.
 */
function buildPointer(
  identifier: string,
  allocation: Memory.Allocation,
  frameSize: number | undefined,
): Format.Pointer {
  const offset = Number(allocation.offset);
  const length = Number(allocation.size);

  if (frameSize === undefined) {
    // No call frame (main/create): static memory offset.
    return { name: identifier, location: "memory", offset, length };
  }

  // Frame-relative: mem[ mem[FRAME_POINTER] + delta ].
  return {
    group: [
      {
        name: "frame",
        location: "memory",
        offset: Memory.regions.FRAME_POINTER,
        length: 32,
      },
      {
        name: identifier,
        location: "memory",
        offset: { $sum: [{ $read: "frame" }, offset] },
        length,
      },
    ],
  };
}

/**
 * Build a partial variable record for one SSA version: identifier +
 * type + declaration always; pointer only when the version is
 * memory-homed (present in the allocation map).
 */
function buildEntry(
  ssa: Ir.Function.SsaVariable,
  allocation: Memory.Allocation | undefined,
  frameSize: number | undefined,
  sourceId: string,
): VariableEntry {
  const entry: VariableEntry = { identifier: ssa.name };

  const type = convertToEthDebugType(ssa.type);
  if (type) entry.type = type;

  if (ssa.loc) {
    entry.declaration = { source: { id: sourceId }, range: ssa.loc };
  }

  if (allocation) {
    entry.pointer = buildPointer(ssa.name, allocation, frameSize);
  }

  return entry;
}

/**
 * Merge variable entries into an instruction's debug context as a
 * flat `variables` sibling, appending to any existing `variables`
 * (e.g. storage variables from irgen) and preserving all other keys.
 * Storage entries take precedence over a same-identifier local.
 */
function withVariables(
  debug: Ir.Instruction.Debug | undefined,
  entries: VariableEntry[],
): Ir.Instruction.Debug {
  if (entries.length === 0) return debug ?? {};

  const context = (debug?.context ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(context.variables)
    ? (context.variables as VariableEntry[])
    : [];

  const have = new Set(
    existing
      .map((v) => v.identifier)
      .filter((id): id is string => id !== undefined),
  );
  const fresh = entries.filter(
    (e) => e.identifier === undefined || !have.has(e.identifier),
  );
  if (fresh.length === 0) return debug ?? {};

  return {
    context: {
      ...context,
      variables: [...existing, ...fresh],
    } as Format.Program.Context,
  };
}

/** Whether block `a` dominates-or-equals block `b`. */
function dominatesBlock(
  a: string,
  b: string,
  idom: Record<string, string | null>,
): boolean {
  let current: string | null = b;
  while (current !== null) {
    if (current === a) return true;
    current = idom[current] ?? null;
  }
  return false;
}

/** Whether def-site `d` dominates-or-equals position (block,index). */
function defDominates(
  d: DefSite,
  block: string,
  index: number,
  idom: Record<string, string | null>,
): boolean {
  if (d.block === block) return d.index <= index;
  return dominatesBlock(d.block, block, idom);
}

/** Def site of every temp: parameters + phis at block entry (-1),
 * instruction results at their index. */
function collectDefSites(func: Ir.Function): Map<string, DefSite> {
  const defs = new Map<string, DefSite>();
  for (const p of func.parameters) {
    defs.set(p.tempId, { block: func.entry, index: -1 });
  }
  for (const [blockId, block] of func.blocks) {
    for (const phi of block.phis ?? []) {
      defs.set(phi.dest, { block: blockId, index: -1 });
    }
    block.instructions.forEach((inst, i) => {
      if ("dest" in inst && typeof inst.dest === "string") {
        defs.set(inst.dest, { block: blockId, index: i });
      }
    });
  }
  return defs;
}

/** The source offset of an instruction/terminator, from its `code`
 * context, if present. */
function codeOffset(
  debug: Ir.Instruction.Debug | undefined,
): number | undefined {
  const code = (
    debug?.context as { code?: { range?: { offset?: unknown } } } | undefined
  )?.code;
  const offset = code?.range?.offset;
  return offset == null ? undefined : Number(offset);
}

/**
 * Lexical scope of a source identifier, as bytecode-source intervals.
 * `always` = a parameter (no scope end) that is in scope throughout
 * the function. `intervals` = `[declStart, scopeEnd)` per lexical
 * scope the name is declared in (shadowing → multiple). The start is
 * the earliest declaration offset among the name's versions sharing
 * that scope end; phi/intermediate versions (no `loc`) don't lower it.
 */
interface NameScope {
  always: boolean;
  intervals: Array<[start: number, end: number]>;
}

function buildNameScopes(
  byName: Map<string, Ir.Function.SsaVariable[]>,
): Map<string, NameScope> {
  const out = new Map<string, NameScope>();
  for (const [name, versions] of byName) {
    let always = false;
    const startByEnd = new Map<number, number>();
    for (const v of versions) {
      if (v.scopeEnd === undefined) {
        always = true;
        continue;
      }
      if (!v.loc) continue; // no declaration offset → don't set start
      const start = Number(v.loc.offset);
      const prev = startByEnd.get(v.scopeEnd);
      startByEnd.set(
        v.scopeEnd,
        prev === undefined ? start : Math.min(prev, start),
      );
    }
    out.set(name, {
      always,
      intervals: [...startByEnd].map(([end, start]) => [start, end]),
    });
  }
  return out;
}

/** Whether the source identifier is lexically in scope at `offset`.
 * Unknown offset ⇒ don't drop (treated as in scope). */
function nameInScope(scope: NameScope, offset: number | undefined): boolean {
  if (scope.always) return true;
  if (offset === undefined) return true;
  return scope.intervals.some(([s, e]) => offset >= s && offset < e);
}

/**
 * Among candidate versions, the current one by dominance — the latest
 * (deepest-dominating) def that dominates-or-equals (block,index).
 * Returns undefined if none is available yet (in scope, not located).
 */
function dominatingVersion(
  candidates: Ir.Function.SsaVariable[],
  tempOf: Map<Ir.Function.SsaVariable, string>,
  defs: Map<string, DefSite>,
  block: string,
  index: number,
  idom: Record<string, string | null>,
): { ssa: Ir.Function.SsaVariable; temp: string } | undefined {
  let best:
    | { ssa: Ir.Function.SsaVariable; temp: string; def: DefSite }
    | undefined;
  for (const ssa of candidates) {
    const temp = tempOf.get(ssa)!;
    const def = defs.get(temp);
    if (!def || !defDominates(def, block, index, idom)) continue;
    if (!best) {
      best = { ssa, temp, def };
      continue;
    }
    const later =
      def.block === best.def.block
        ? def.index > best.def.index
        : dominatesBlock(best.def.block, def.block, idom);
    if (later) best = { ssa, temp, def };
  }
  return best;
}

/**
 * Build the snapshot at (block,index) with source `offset`. LIST axis:
 * every lexically-in-scope variable is listed (name + type). POINTER
 * axis: a pointer is attached only where the value is located (its
 * current version's def dominates and it is memory-homed); otherwise
 * the record is type-only ("in scope, no value").
 */
function snapshotAt(
  byName: Map<string, Ir.Function.SsaVariable[]>,
  scopes: Map<string, NameScope>,
  tempOf: Map<Ir.Function.SsaVariable, string>,
  defs: Map<string, DefSite>,
  block: string,
  index: number,
  offset: number | undefined,
  idom: Record<string, string | null>,
  allocations: Record<string, Memory.Allocation>,
  frameSize: number | undefined,
  sourceId: string,
): VariableEntry[] {
  const entries: VariableEntry[] = [];
  for (const [name, versions] of byName) {
    // LIST axis: is the identifier lexically in scope here?
    if (!nameInScope(scopes.get(name)!, offset)) continue;

    // POINTER axis: the current version by dominance (if located).
    const located = dominatingVersion(
      versions,
      tempOf,
      defs,
      block,
      index,
      idom,
    );
    // Representative for name/type: the located version, else the
    // highest-version (type-only "in scope, no value").
    const repr =
      located?.ssa ??
      versions.reduce((a, b) => (b.version > a.version ? b : a));
    const allocation = located ? allocations[located.temp] : undefined;
    entries.push(buildEntry(repr, allocation, frameSize, sourceId));
  }
  return entries;
}

/**
 * Stamp every instruction AND terminator of a function with its
 * variable snapshot (in-scope list + pointer-where-located).
 */
function enrichFunction(
  func: Ir.Function,
  module: Ir.Module,
  memory: Memory.Function.Info,
  sourceId: string,
): void {
  if (!func.ssaVariables || func.ssaVariables.size === 0) return;

  const { allocations, frameSize } = memory;

  const byName = new Map<string, Ir.Function.SsaVariable[]>();
  const tempOf = new Map<Ir.Function.SsaVariable, string>();
  for (const [temp, ssa] of func.ssaVariables) {
    tempOf.set(ssa, temp);
    const list = byName.get(ssa.name);
    if (list) list.push(ssa);
    else byName.set(ssa.name, [ssa]);
  }
  if (byName.size === 0) return;

  const scopes = buildNameScopes(byName);
  const defs = collectDefSites(func);
  const idom = new Ir.Analysis.Statistics.Analyzer().analyze({
    ...module,
    main: func,
  }).dominatorTree;

  // Carry the last known source offset forward (function-wide) so
  // synthesized ops without a `code` context inherit a nearby scope.
  let lastOffset: number | undefined;
  const stamp = (
    debug: Ir.Instruction.Debug | undefined,
    blockId: string,
    index: number,
  ): Ir.Instruction.Debug => {
    const offset = codeOffset(debug) ?? lastOffset;
    if (offset !== undefined) lastOffset = offset;
    const entries = snapshotAt(
      byName,
      scopes,
      tempOf,
      defs,
      blockId,
      index,
      offset,
      idom,
      allocations,
      frameSize,
      sourceId,
    );
    // withVariables returns the (possibly unchanged) debug, never
    // undefined, so it is safe to assign back to a required field.
    return withVariables(debug, entries);
  };

  for (const [blockId, block] of func.blocks) {
    block.instructions.forEach((inst, i) => {
      inst.operationDebug = stamp(inst.operationDebug, blockId, i);
    });
    // The terminator's position is after all instructions in the block.
    if (block.terminator) {
      block.terminator.operationDebug = stamp(
        block.terminator.operationDebug,
        blockId,
        block.instructions.length,
      );
    }
  }
}

/**
 * Enrich a module's instructions with per-instruction guaranteed-
 * known local-variable snapshots. Mutates in place; safe before
 * generation.
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
