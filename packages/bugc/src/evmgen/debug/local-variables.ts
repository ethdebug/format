/**
 * Local-variable debug info (emission, O0, memory-homed).
 *
 * Emits `variables` contexts for LOCAL variables (function
 * parameters and `let` bindings) that the memory planner spilled to
 * frame-relative memory (present in a function's `allocations`
 * map). Each such local has a stable location for its whole
 * lifetime at O0, so its `variables` entry is attached to the
 * instructions across which it is live.
 *
 * Scope (first cut):
 *  - O0 only. Under optimization, locations move or dissolve; not
 *    covered here.
 *  - Memory-homed locals only. Stack-resident temps have no tracked
 *    position yet and are omitted.
 *  - Liveness is applied at block granularity (a local's entry
 *    rides every instruction of a block in which it is live).
 *
 * The location pointer encodes bugc's runtime frame convention: the
 * frame base pointer lives in machine memory at `FRAME_POINTER`
 * (0x80); a frame-homed local is at `mem[ mem[FRAME_POINTER] +
 * delta ]`. This is expressed with existing pointer vocabulary — a
 * `group` that names the frame-pointer machine region and a data
 * region whose offset reads it (`$read`) and adds the static delta
 * (`$sum`). Functions without a frame (main/create) home locals at
 * a static memory offset.
 */
import type * as Format from "@ethdebug/format";

import * as Ir from "#ir";
import { Liveness, Memory } from "#evmgen/analysis";
import { convertToEthDebugType } from "../../irgen/debug/types.js";

type VariableEntry = Format.Program.Context.Variables["variables"][number];

/**
 * Build the location pointer for a memory-homed local.
 *
 * Frame-homed (user function): a group naming the frame-pointer
 * machine region, then the data region at `FP + delta`. Static
 * (main/create): a plain memory region at the fixed offset.
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
    return { location: "memory", offset, length };
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
 * Build a `variables` entry for one memory-homed local, or
 * undefined if it has no SSA metadata (unnamed temp) or an
 * unconvertible type.
 */
function buildEntry(
  tempId: string,
  ssa: Ir.Function.SsaVariable | undefined,
  allocation: Memory.Allocation,
  frameSize: number | undefined,
  sourceId: string,
): VariableEntry | undefined {
  if (!ssa) return undefined;

  const entry: VariableEntry = {
    identifier: ssa.name,
    pointer: buildPointer(ssa.name, allocation, frameSize),
  };

  const type = convertToEthDebugType(ssa.type);
  if (type) entry.type = type;

  if (ssa.loc) {
    entry.declaration = { source: { id: sourceId }, range: ssa.loc };
  }

  return entry;
}

/**
 * Merge local-variable entries into an instruction's debug context
 * as a flat `variables` sibling. If the context already carries a
 * `variables` array (e.g. storage variables from irgen), the local
 * entries are appended to it; otherwise a `variables` key is added.
 * All other keys (code, etc.) are preserved.
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

  // Avoid duplicating an identifier already present (storage vars
  // take precedence; don't shadow them).
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

/**
 * Memory-homed temps live at block granularity anywhere they are
 * live within a block: values live-in, live-out, or defined in the
 * block. Intersected with the allocations map (memory-homed).
 */
function liveMemoryHomed(
  blockId: string,
  block: Ir.Block,
  liveness: Liveness.Function.Info,
  allocations: Record<string, Memory.Allocation>,
): Set<string> {
  const live = new Set<string>();
  const consider = (id: string) => {
    if (id in allocations) live.add(id);
  };

  for (const id of liveness.liveIn.get(blockId) ?? []) consider(id);
  for (const id of liveness.liveOut.get(blockId) ?? []) consider(id);
  for (const phi of block.phis) consider(phi.dest);
  for (const inst of block.instructions) {
    if ("dest" in inst && typeof inst.dest === "string") consider(inst.dest);
  }

  return live;
}

/**
 * Enrich a single function's instructions in place with live
 * memory-homed local `variables` contexts.
 */
function enrichFunction(
  func: Ir.Function,
  liveness: Liveness.Function.Info,
  memory: Memory.Function.Info,
  sourceId: string,
): void {
  const { allocations, frameSize } = memory;
  if (!func.ssaVariables || Object.keys(allocations).length === 0) return;

  // Precompute an entry per memory-homed temp that has SSA metadata.
  const entryFor = new Map<string, VariableEntry>();
  for (const tempId of Object.keys(allocations)) {
    const entry = buildEntry(
      tempId,
      func.ssaVariables.get(tempId),
      allocations[tempId],
      frameSize,
      sourceId,
    );
    if (entry) entryFor.set(tempId, entry);
  }
  if (entryFor.size === 0) return;

  for (const [blockId, block] of func.blocks) {
    const live = liveMemoryHomed(blockId, block, liveness, allocations);
    const entries = [...live]
      .map((id) => entryFor.get(id))
      .filter((e): e is VariableEntry => e !== undefined);
    if (entries.length === 0) continue;

    for (const inst of block.instructions) {
      inst.operationDebug = withVariables(inst.operationDebug, entries);
    }
  }
}

/**
 * Enrich a module's instructions with local-variable debug info.
 * Returns the same module (mutated in place); safe to call before
 * generation.
 */
export function enrich(
  module: Ir.Module,
  liveness: Liveness.Module.Info,
  memory: Memory.Module.Info,
): Ir.Module {
  const sourceId = module.sourceId;

  const targets: {
    func: Ir.Function;
    live?: Liveness.Function.Info;
    mem?: Memory.Function.Info;
  }[] = [
    { func: module.main, live: liveness.main, mem: memory.main },
    ...(module.create
      ? [{ func: module.create, live: liveness.create, mem: memory.create }]
      : []),
    ...[...module.functions].map(([name, func]) => ({
      func,
      live: liveness.functions[name],
      mem: memory.functions[name],
    })),
  ];

  for (const { func, live, mem } of targets) {
    if (!live || !mem) continue;
    enrichFunction(func, live, mem, sourceId);
  }

  return module;
}
