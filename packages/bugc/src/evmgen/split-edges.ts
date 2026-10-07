import * as Ir from "#ir";

/**
 * Codegen stores a phi's source value just before the predecessor
 * jumps to the phi's block. A branch cannot do that for one target
 * only, so put an empty block on each branch edge into a block that
 * has phis.
 */
export function splitPhiBranchEdges(module: Ir.Module): Ir.Module {
  const functions = new Map(
    [...module.functions].map(([name, func]) => [name, splitFunction(func)]),
  );
  return {
    ...module,
    functions,
    main: splitFunction(module.main),
    ...(module.create ? { create: splitFunction(module.create) } : {}),
  };
}

function splitFunction(func: Ir.Function): Ir.Function {
  const blocks = new Map(func.blocks);

  // Route the edge from predId into targetId through a new empty
  // block if targetId has phis; return the block to branch to
  const split = (predId: string, pred: Ir.Block, targetId: string): string => {
    const target = blocks.get(targetId);
    if (!target || target.phis.length === 0) {
      return targetId;
    }

    // The edge is the branch's: it has the branch's source range,
    // variables and transforms (as `inline`, in an inlined body), but
    // not its invoke or return
    const { context, inlineSites, origin } = pred.terminator.operationDebug;
    const edgeContext = Ir.Utils.withoutActivations(context);
    const edgeId = `${predId}_to_${targetId}`;
    blocks.set(edgeId, {
      id: edgeId,
      instructions: [],
      terminator: {
        kind: "jump",
        target: targetId,
        operationDebug: {
          ...(edgeContext ? { context: edgeContext } : {}),
          ...(inlineSites ? { inlineSites } : {}),
          ...(origin ? { origin } : {}),
        },
      },
      predecessors: new Set([predId]),
      phis: [],
      debug: {},
    });
    const rename = (id: string) => (id === predId ? edgeId : id);
    blocks.set(targetId, {
      ...target,
      predecessors: new Set([...target.predecessors].map(rename)),
      phis: target.phis.map((phi) => ({
        ...phi,
        sources: new Map(
          [...phi.sources].map(([id, value]) => [rename(id), value]),
        ),
      })),
    });
    return edgeId;
  };

  for (const predId of func.blocks.keys()) {
    const pred = blocks.get(predId)!;
    if (pred.terminator.kind !== "branch") {
      continue;
    }

    const { trueTarget, falseTarget } = pred.terminator;
    const newTrue = split(predId, pred, trueTarget);
    const newFalse =
      falseTarget === trueTarget ? newTrue : split(predId, pred, falseTarget);
    blocks.set(predId, {
      ...blocks.get(predId)!,
      terminator: {
        ...pred.terminator,
        trueTarget: newTrue,
        falseTarget: newFalse,
      },
    });
  }

  const result = { ...func, blocks };
  Ir.Utils.copyDebugInfo(func, result);
  return result;
}
