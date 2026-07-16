/**
 * Local-variable debug info (emission, O0) — per-instruction
 * guaranteed-known snapshot.
 *
 * Each instruction's `variables` context lists the local variables
 * (parameters + `let`s) whose value the compiler can GUARANTEE is
 * known after that instruction executes. Availability is computed by
 * DOMINANCE (not liveness): a variable is known at P iff the def of
 * its current SSA version dominates-or-equals P — so it is never
 * reported before its defining store (no stale/uninitialized value),
 * and reassignment resolves to the current version's slot.
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

/**
 * The current SSA version of a source identifier at (block,index):
 * among the identifier's versions whose def dominates-or-equals the
 * position, the one with the LATEST (deepest-dominating) def — which
 * resolves reassignment (later def wins) to the value actually live.
 *
 * Scope note: dominance never "ends", so a def dominates its whole
 * dominated subtree. For a straight-line block-local that means it
 * can remain reported after its lexical block; for shadowing the
 * inner version can win past its block. That's a scope-precision
 * limit of the dominance-only model (a later scope-exit refinement
 * tightens it); it never reports a value before its def.
 */
function currentVersionAt(
  versions: Ir.Function.SsaVariable[],
  tempOf: Map<Ir.Function.SsaVariable, string>,
  defs: Map<string, DefSite>,
  block: string,
  index: number,
  idom: Record<string, string | null>,
): { ssa: Ir.Function.SsaVariable; temp: string } | undefined {
  let best:
    | { ssa: Ir.Function.SsaVariable; temp: string; def: DefSite }
    | undefined;
  for (const ssa of versions) {
    const temp = tempOf.get(ssa)!;
    const def = defs.get(temp);
    if (!def || !defDominates(def, block, index, idom)) continue;
    if (!best) {
      best = { ssa, temp, def };
      continue;
    }
    // Prefer the later/deeper dominating def.
    const later =
      def.block === best.def.block
        ? def.index > best.def.index
        : dominatesBlock(best.def.block, def.block, idom);
    if (later) best = { ssa, temp, def };
  }
  return best;
}

/**
 * Stamp each instruction of a function with its guaranteed-known
 * variable snapshot.
 */
function enrichFunction(
  func: Ir.Function,
  module: Ir.Module,
  memory: Memory.Function.Info,
  sourceId: string,
): void {
  if (!func.ssaVariables || func.ssaVariables.size === 0) return;

  const { allocations, frameSize } = memory;

  // Group SSA versions by source identifier; remember each version's
  // temp id.
  const byName = new Map<string, Ir.Function.SsaVariable[]>();
  const tempOf = new Map<Ir.Function.SsaVariable, string>();
  for (const [temp, ssa] of func.ssaVariables) {
    tempOf.set(ssa, temp);
    const list = byName.get(ssa.name);
    if (list) list.push(ssa);
    else byName.set(ssa.name, [ssa]);
  }
  if (byName.size === 0) return;

  const defs = collectDefSites(func);
  const idom = new Ir.Analysis.Statistics.Analyzer().analyze({
    ...module,
    main: func,
  }).dominatorTree;

  for (const [blockId, block] of func.blocks) {
    block.instructions.forEach((inst, i) => {
      const entries: VariableEntry[] = [];
      for (const versions of byName.values()) {
        const current = currentVersionAt(
          versions,
          tempOf,
          defs,
          blockId,
          i,
          idom,
        );
        if (!current) continue;
        entries.push(
          buildEntry(
            current.ssa,
            allocations[current.temp],
            frameSize,
            sourceId,
          ),
        );
      }
      if (entries.length > 0) {
        inst.operationDebug = withVariables(inst.operationDebug, entries);
      }
    });
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
