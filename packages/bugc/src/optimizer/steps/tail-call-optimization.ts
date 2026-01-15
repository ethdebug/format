import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

/**
 * Tail Call Optimization
 *
 * Optimizes tail-recursive calls by transforming them into loops with phi
 * nodes. This eliminates the call overhead and prevents stack growth.
 *
 * A tail call is eligible for optimization when:
 * 1. The call is to the current function (recursion)
 * 2. The continuation block immediately returns the call result
 * 3. The continuation block has no other instructions or phis
 *
 * Transformation approach:
 *   - Create a loop header block with phi nodes for parameters
 *   - Redirect the tail-recursive call to jump to the loop header
 *   - The phi nodes select between initial parameters and recursive arguments
 */
export class TailCallOptimizationStep extends BaseOptimizationStep {
  name = "tail-call-optimization";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    this.processAllFunctions(optimized, (func, funcName) => {
      const blocksToRemove = new Set<string>();

      // First pass: identify all tail-recursive calls
      const tailCallBlocks: string[] = [];

      for (const [blockId, block] of func.blocks) {
        // Only process call terminators
        if (block.terminator.kind !== "call") {
          continue;
        }

        const callTerm = block.terminator;

        // Check if this is a recursive call to the current function
        if (callTerm.function !== funcName) {
          continue;
        }

        // Get the continuation block
        const contBlock = func.blocks.get(callTerm.continuation);
        if (!contBlock) {
          continue;
        }

        // Check if continuation block is a tail position:
        // - No phis
        // - No instructions
        // - Returns the call result (or void if no result)
        if (
          contBlock.phis.length > 0 ||
          contBlock.instructions.length > 0 ||
          contBlock.terminator.kind !== "return"
        ) {
          continue;
        }

        const returnTerm = contBlock.terminator;

        // Verify the return value matches the call destination
        const returnMatchesCall =
          (callTerm.dest === undefined && returnTerm.value === undefined) ||
          (callTerm.dest !== undefined &&
            returnTerm.value !== undefined &&
            returnTerm.value.kind === "temp" &&
            returnTerm.value.id === callTerm.dest);

        if (!returnMatchesCall) {
          continue;
        }

        tailCallBlocks.push(blockId);
      }

      // If we found tail calls, create a loop structure
      if (tailCallBlocks.length > 0) {
        // Create a new loop header block that will contain phis for parameters
        const loopHeaderId = `${func.entry}_loop`;
        const originalEntry = func.blocks.get(func.entry);

        if (!originalEntry) {
          return; // Should not happen
        }

        // Create phi nodes for each parameter
        const paramPhis: Ir.Block.Phi[] = [];
        for (let i = 0; i < func.parameters.length; i++) {
          const param = func.parameters[i];
          const phiSources = new Map<string, Ir.Value>();

          // Initial value from function entry
          phiSources.set(func.entry, {
            kind: "temp",
            id: param.tempId,
            type: param.type,
          });

          paramPhis.push({
            kind: "phi",
            sources: phiSources,
            dest: `${param.tempId}_loop`,
            type: param.type,
            operationDebug: { context: param.loc ? undefined : undefined },
          });
        }

        // Create the loop header block
        const loopHeader: Ir.Block = {
          id: loopHeaderId,
          phis: paramPhis,
          instructions: [],
          terminator: {
            kind: "jump",
            target: func.entry,
            operationDebug: {},
          },
          predecessors: new Set([func.entry, ...tailCallBlocks]),
          debug: {},
        };

        func.blocks.set(loopHeaderId, loopHeader);

        // Transform each tail call
        for (const blockId of tailCallBlocks) {
          const block = func.blocks.get(blockId)!;
          const callTerm = block.terminator as Ir.Block.Terminator & {
            kind: "call";
          };
          const contBlock = func.blocks.get(callTerm.continuation)!;

          // Update phi sources with arguments from this tail call
          for (let i = 0; i < func.parameters.length; i++) {
            if (i < callTerm.arguments.length) {
              paramPhis[i].sources.set(blockId, callTerm.arguments[i]);
            }
          }

          // Replace call with jump to loop header
          block.terminator = {
            kind: "jump",
            target: loopHeaderId,
            operationDebug: callTerm.operationDebug,
          };

          // Track the transformation
          context.trackTransformation({
            type: "replace",
            pass: this.name,
            original: [
              ...Ir.Utils.extractContexts(block),
              ...Ir.Utils.extractContexts(contBlock),
            ],
            result: Ir.Utils.extractContexts(block),
            reason: `Optimized tail-recursive call to ${funcName} into loop`,
          });

          // Mark continuation block for removal if it has no other
          // predecessors
          const otherPredecessors = Array.from(contBlock.predecessors).filter(
            (pred) => pred !== blockId,
          );

          if (otherPredecessors.length === 0) {
            blocksToRemove.add(callTerm.continuation);

            context.trackTransformation({
              type: "delete",
              pass: this.name,
              original: Ir.Utils.extractContexts(contBlock),
              result: [],
              reason: `Removed unused continuation block ${callTerm.continuation}`,
            });
          } else {
            // Update predecessors
            contBlock.predecessors.delete(blockId);
          }
        }
      }

      // Remove marked blocks
      for (const blockId of blocksToRemove) {
        func.blocks.delete(blockId);
      }

      // Update all predecessor sets to remove deleted blocks
      for (const block of func.blocks.values()) {
        for (const deletedBlock of blocksToRemove) {
          block.predecessors.delete(deletedBlock);
        }
      }
    });

    return optimized;
  }
}
