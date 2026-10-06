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
  const split = (predId: string, targetId: string): string => {
    const target = blocks.get(targetId);
    if (!target || target.phis.length === 0) {
      return targetId;
    }

    const edgeId = `${predId}_to_${targetId}`;
    blocks.set(edgeId, {
      id: edgeId,
      instructions: [],
      // No debug context - compiler-generated edge block
      terminator: { kind: "jump", target: targetId, operationDebug: {} },
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
    const newTrue = split(predId, trueTarget);
    const newFalse =
      falseTarget === trueTarget ? newTrue : split(predId, falseTarget);
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
