import * as Ir from "#ir";

/**
 * Record where each instruction, terminator and variable version is
 * before optimization, with each function's dominator tree. Debug
 * info uses these to tell which version of a local is current at an
 * optimized instruction, including versions the optimizer removed.
 */
export function recordOrigins(module: Ir.Module): void {
  const functions = [
    module.main,
    ...(module.create ? [module.create] : []),
    ...module.functions.values(),
  ];
  for (const func of functions) {
    const at = (block: string, index: number): Ir.Function.Origin => ({
      function: func.name,
      block,
      index,
    });
    // Out of the optimizer's sight, like the rest of the debug info
    // (see setDebugInfo)
    const idom = new Ir.Analysis.Statistics.Analyzer().analyze({
      ...module,
      main: func,
    }).dominatorTree;
    Ir.Utils.setDebugInfo(func, "origins", new Map([[func.name, idom]]));
    for (const [id, block] of func.blocks) {
      block.instructions.forEach((inst, i) => {
        inst.operationDebug = { ...inst.operationDebug, origin: at(id, i) };
      });
      block.terminator.operationDebug = {
        ...block.terminator.operationDebug,
        origin: at(id, block.instructions.length),
      };
    }
    const defs = Ir.Utils.defSites(func);
    for (const [key, ssa] of func.ssaVariables ?? []) {
      const def = ssa.defined ?? defs.get(ssa.temp ?? key);
      if (def && !ssa.placeholder) {
        func.ssaVariables!.set(key, {
          ...ssa,
          origin: at(def.block, def.index),
        });
      }
    }
  }
}
