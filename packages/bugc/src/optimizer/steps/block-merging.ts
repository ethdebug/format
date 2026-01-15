import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class BlockMergingStep extends BaseOptimizationStep {
  name = "block-merging";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Find candidates for merging
      const mergeMap = new Map<string, string>(); // maps block to its merge target

      for (const [blockId, block] of func.blocks) {
        if (block.terminator.kind === "jump" && block.predecessors.size === 1) {
          const targetBlock = func.blocks.get(block.terminator.target);

          // Only merge if target has single predecessor
          if (targetBlock && targetBlock.predecessors.size === 1) {
            mergeMap.set(block.terminator.target, blockId);
          }
        }
      }

      // Perform merging
      for (const [toMerge, mergeInto] of mergeMap) {
        const sourceBlock = func.blocks.get(toMerge);
        const targetBlock = func.blocks.get(mergeInto);

        if (!sourceBlock || !targetBlock) continue;

        // Merge phi nodes from source to target
        if (sourceBlock.phis && targetBlock.phis) {
          targetBlock.phis.push(...sourceBlock.phis);
        }

        // Append instructions from source to target
        targetBlock.instructions.push(...sourceBlock.instructions);
        targetBlock.terminator = sourceBlock.terminator;

        // Combine debug contexts from both blocks
        targetBlock.debug = Ir.Utils.combineDebugContexts(
          targetBlock.debug,
          sourceBlock.debug,
        );

        // Track the merge transformation
        context.trackTransformation({
          type: "merge",
          pass: this.name,
          original: Ir.Utils.extractContexts(targetBlock, sourceBlock),
          result: Ir.Utils.extractContexts(targetBlock),
          reason: `Merged block ${toMerge} into ${mergeInto}`,
        });

        // Remove the merged block
        func.blocks.delete(toMerge);

        // Update predecessors and jump targets
        for (const block of func.blocks.values()) {
          // Update predecessors
          if (block.predecessors.has(toMerge)) {
            block.predecessors.delete(toMerge);
            block.predecessors.add(mergeInto);
          }

          // Update jump targets in terminators
          if (
            block.terminator.kind === "jump" &&
            block.terminator.target === toMerge
          ) {
            block.terminator.target = mergeInto;
          } else if (block.terminator.kind === "branch") {
            if (block.terminator.trueTarget === toMerge) {
              block.terminator.trueTarget = mergeInto;
            }
            if (block.terminator.falseTarget === toMerge) {
              block.terminator.falseTarget = mergeInto;
            }
          }
        }
      }
    });

    return optimized;
  }
}
