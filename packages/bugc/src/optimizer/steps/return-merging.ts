import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class ReturnMergingStep extends BaseOptimizationStep {
  name = "return-merging";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Group blocks by their return value (or lack thereof)
      const returnGroups = new Map<string, string[]>(); // signature -> block IDs

      for (const [blockId, block] of func.blocks) {
        if (block.terminator.kind === "return") {
          // Create a signature for the return statement
          const signature = this.getReturnSignature(block.terminator.value);

          if (!returnGroups.has(signature)) {
            returnGroups.set(signature, []);
          }
          returnGroups.get(signature)!.push(blockId);
        }
      }

      // For each group with multiple blocks, merge them
      for (const [, blockIds] of returnGroups) {
        if (blockIds.length > 1) {
          // Keep the first block as the target
          const targetBlockId = blockIds[0];
          const targetBlock = func.blocks.get(targetBlockId)!;

          // Redirect all other blocks to jump to the target
          for (let i = 1; i < blockIds.length; i++) {
            const sourceBlockId = blockIds[i];
            const sourceBlock = func.blocks.get(sourceBlockId)!;

            // Only merge if the block contains only the return statement
            if (sourceBlock.instructions.length === 0) {
              // Update all references to the source block to point to target
              for (const [, block] of func.blocks) {
                if (
                  block.terminator.kind === "jump" &&
                  block.terminator.target === sourceBlockId
                ) {
                  block.terminator.target = targetBlockId;

                  context.trackTransformation({
                    type: "replace",
                    pass: this.name,
                    original: Ir.Utils.extractContexts(block),
                    result: Ir.Utils.extractContexts(block),
                    reason: `Redirected jump from ${sourceBlockId} to ${targetBlockId} (return merging)`,
                  });
                } else if (block.terminator.kind === "branch") {
                  if (block.terminator.trueTarget === sourceBlockId) {
                    block.terminator.trueTarget = targetBlockId;

                    context.trackTransformation({
                      type: "replace",
                      pass: this.name,
                      original: Ir.Utils.extractContexts(block),
                      result: Ir.Utils.extractContexts(block),
                      reason: `Redirected true branch from ${sourceBlockId} to ${targetBlockId} (return merging)`,
                    });
                  }
                  if (block.terminator.falseTarget === sourceBlockId) {
                    block.terminator.falseTarget = targetBlockId;

                    context.trackTransformation({
                      type: "replace",
                      pass: this.name,
                      original: Ir.Utils.extractContexts(block),
                      result: Ir.Utils.extractContexts(block),
                      reason: `Redirected false branch from ${sourceBlockId} to ${targetBlockId} (return merging)`,
                    });
                  }
                }
              }

              // Update predecessors in the target block
              for (const pred of sourceBlock.predecessors) {
                targetBlock.predecessors.add(pred);
              }
              targetBlock.predecessors.delete(sourceBlockId);

              // Update all blocks that reference the source block
              for (const [, block] of func.blocks) {
                if (block.predecessors.has(sourceBlockId)) {
                  block.predecessors.delete(sourceBlockId);
                  block.predecessors.add(targetBlockId);
                }
              }

              // Remove the merged block
              func.blocks.delete(sourceBlockId);

              context.trackTransformation({
                type: "delete",
                pass: this.name,
                original: Ir.Utils.extractContexts(sourceBlock),
                result: [],
                reason: `Merged return block ${sourceBlockId} into ${targetBlockId}`,
              });
            }
          }
        }
      }
    });

    return optimized;
  }

  private getReturnSignature(value?: Ir.Value): string {
    if (!value) {
      return "void";
    }

    // For now, we only merge void returns
    // In the future, we could extend this to merge returns with identical constant values
    if (value.kind === "const") {
      return `const:${value.type.kind}:${value.value}`;
    } else if (value.kind === "temp") {
      return `temp:${value.id}`;
    }

    return "unknown";
  }
}
