import type * as Ir from "#ir";

/**
 * Where a temp is defined: a block plus an instruction index (`-1`:
 * block entry, i.e. a parameter or a phi, before all instructions).
 */
export interface DefSite {
  block: string;
  index: number;
}

/**
 * The def site of every temp a function defines: parameters and phis
 * at block entry, instruction results at their index, and call
 * results at their continuation's entry (the result is on the stack
 * when the continuation begins).
 */
export function defSites(func: Ir.Function): Map<string, DefSite> {
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
    const term = block.terminator;
    if (term.kind === "call" && term.dest) {
      defs.set(term.dest, { block: term.continuation, index: -1 });
    }
  }
  return defs;
}

/** Whether block `a` dominates (or is) block `b`. */
export function dominatesBlock(
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

/** Whether def site `d` dominates (or is) position (block, index). */
export function dominates(
  d: DefSite,
  block: string,
  index: number,
  idom: Record<string, string | null>,
): boolean {
  if (d.block === block) return d.index <= index;
  return dominatesBlock(d.block, block, idom);
}
