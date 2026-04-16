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

      // If we found tail calls, transform into a loop.
      //
      // Strategy: create a trampoline "pre_entry" block as
      // the new function entry. Add phi nodes to the original
      // entry block that select between the initial param
      // values (from pre_entry) and the tail-call arguments
      // (from each tail-call site). Tail-call blocks jump
      // directly to the original entry.
      if (tailCallBlocks.length > 0) {
        const origEntryId = func.entry;
        const origEntry = func.blocks.get(origEntryId);
        if (!origEntry) return;

        // Create trampoline that becomes the new func.entry
        const preEntryId = `${origEntryId}_pre`;
        const preEntry: Ir.Block = {
          id: preEntryId,
          phis: [],
          instructions: [],
          terminator: {
            kind: "jump",
            target: origEntryId,
            operationDebug: {},
          },
          predecessors: new Set<string>(),
          debug: {},
        };
        func.blocks.set(preEntryId, preEntry);
        func.entry = preEntryId;

        // Build phi nodes on the original entry block.
        // Sources: preEntry → original param, each tail
        // call block → the call's corresponding argument.
        const paramPhis: Ir.Block.Phi[] = [];
        for (let i = 0; i < func.parameters.length; i++) {
          const param = func.parameters[i];
          const sources = new Map<string, Ir.Value>();
          sources.set(preEntryId, {
            kind: "temp",
            id: param.tempId,
            type: param.type,
          });
          paramPhis.push({
            kind: "phi",
            sources,
            dest: param.tempId,
            type: param.type,
            operationDebug: {},
          });
        }

        // Transform each tail call: replace call with jump
        // to origEntry, add phi sources for arguments.
        for (const blockId of tailCallBlocks) {
          const block = func.blocks.get(blockId)!;
          const callTerm = block.terminator as Ir.Block.Terminator & {
            kind: "call";
          };
          const contBlock = func.blocks.get(callTerm.continuation)!;

          for (let i = 0; i < func.parameters.length; i++) {
            if (i < callTerm.arguments.length) {
              paramPhis[i].sources.set(blockId, callTerm.arguments[i]);
            }
          }

          // Preserve the logical "invoke" identity of the
          // recursive call. Codegen uses this to attach an
          // invoke debug context to the TCO JUMP so the
          // debugger can still see the recursive call in
          // the trace, even though the implementation is
          // now a block-internal jump.
          const tailCall: Ir.Block.TailCall = {
            function: funcName,
            ...(func.loc ? { declarationLoc: func.loc } : {}),
            ...(func.sourceId ? { declarationSourceId: func.sourceId } : {}),
          };

          block.terminator = {
            kind: "jump",
            target: origEntryId,
            operationDebug: callTerm.operationDebug,
            tailCall,
          };

          context.trackTransformation({
            type: "replace",
            pass: this.name,
            original: [
              ...Ir.Utils.extractContexts(block),
              ...Ir.Utils.extractContexts(contBlock),
            ],
            result: Ir.Utils.extractContexts(block),
            reason:
              `Optimized tail-recursive call to ` + `${funcName} into loop`,
          });

          // Remove continuation if no other predecessors
          const otherPreds = Array.from(contBlock.predecessors).filter(
            (p) => p !== blockId,
          );

          if (otherPreds.length === 0) {
            blocksToRemove.add(callTerm.continuation);
            context.trackTransformation({
              type: "delete",
              pass: this.name,
              original: Ir.Utils.extractContexts(contBlock),
              result: [],
              reason:
                `Removed unused continuation block ` + callTerm.continuation,
            });
          } else {
            contBlock.predecessors.delete(blockId);
          }
        }

        // Install phis and update predecessors
        origEntry.phis = [...paramPhis, ...origEntry.phis];
        origEntry.predecessors.add(preEntryId);
        for (const blockId of tailCallBlocks) {
          origEntry.predecessors.add(blockId);
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
