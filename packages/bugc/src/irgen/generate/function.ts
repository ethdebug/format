import type * as Ast from "#ast";
import * as Ir from "#ir";
import { buildBlock } from "./statements/index.js";

import { Process } from "./process.js";

/**
 * Build a function
 */
export function* buildFunction(
  name: string,
  parameters: {
    name: string;
    type: Ir.Type;
    loc?: Ast.SourceLocation;
  }[],
  body: Ast.Block,
): Process<Ir.Function> {
  // Initialize function context
  yield* Process.Functions.initialize(name, parameters);

  // Build function body
  yield* buildBlock(body);

  // Ensure function has a terminator
  {
    const terminator = yield* Process.Blocks.currentTerminator();
    if (!terminator) {
      // Add implicit return
      yield* Process.Blocks.terminate({
        kind: "return",
        value: undefined,
        // No debug context - compiler-generated implicit return
        operationDebug: {},
      });
    }
  }

  // Sync final block
  yield* Process.Blocks.syncCurrent();

  // Compute predecessors from the control flow graph
  const blocksBeforeCompute = yield* Process.Functions.currentBlocks();
  const blocks = computePredecessors(blocksBeforeCompute);
  const params = yield* Process.Functions.currentParameters();

  // Collect SSA variable metadata. A declaration can make a version
  // whose temp is never defined; mark it, so debug info can tell it
  // from a version the optimizer removed.
  const defined = definedTemps(blocks, params);
  const ssaVariables = new Map(
    [...(yield* Process.Functions.collectSsaMetadata())].map(
      ([key, ssa]) =>
        [
          key,
          defined.has(ssa.temp ?? key) ? ssa : { ...ssa, placeholder: true },
        ] as const,
    ),
  );

  const module_ = yield* Process.Modules.current();

  const function_: Ir.Function = {
    name,
    parameters: params,
    entry: "entry",
    blocks,
    ssaVariables: ssaVariables.size > 0 ? ssaVariables : undefined,
    loc: body.loc ?? undefined,
    sourceId: module_.sourceId,
  };

  return function_;
}

/** Temps a function defines: parameters, phis, results, call results */
function definedTemps(
  blocks: Map<string, Ir.Block>,
  params: Ir.Function.Parameter[],
): Set<string> {
  const defined = new Set(params.map((p) => p.tempId));
  for (const block of blocks.values()) {
    for (const phi of block.phis ?? []) defined.add(phi.dest);
    for (const inst of block.instructions) {
      if ("dest" in inst && typeof inst.dest === "string") {
        defined.add(inst.dest);
      }
    }
    if (block.terminator.kind === "call" && block.terminator.dest) {
      defined.add(block.terminator.dest);
    }
  }
  return defined;
}

/**
 * Compute predecessors for all blocks based on their terminators
 */
function computePredecessors(
  blocks: Map<string, Ir.Block>,
): Map<string, Ir.Block> {
  // Create new blocks with fresh predecessor sets
  const result = new Map<string, Ir.Block>();

  // First pass: create all blocks with empty predecessors
  for (const [id, block] of blocks) {
    result.set(id, {
      ...block,
      predecessors: new Set<string>(),
    });
  }

  // Second pass: add predecessors based on terminators
  for (const [sourceId, block] of blocks) {
    const terminator = block.terminator;
    if (!terminator) continue;

    // Add edges based on terminator type
    switch (terminator.kind) {
      case "jump": {
        const targetBlock = result.get(terminator.target);
        if (targetBlock) {
          targetBlock.predecessors.add(sourceId);
        }
        break;
      }
      case "branch": {
        const trueBlock = result.get(terminator.trueTarget);
        if (trueBlock) {
          trueBlock.predecessors.add(sourceId);
        }
        const falseBlock = result.get(terminator.falseTarget);
        if (falseBlock) {
          falseBlock.predecessors.add(sourceId);
        }
        break;
      }
      // "return" and "unreachable" have no successors
    }
  }

  return result;
}
