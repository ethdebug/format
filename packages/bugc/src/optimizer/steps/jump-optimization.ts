import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class JumpOptimizationStep extends BaseOptimizationStep {
  name = "jump-optimization";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Find blocks that are just jumps to other blocks
      const jumpTargets = new Map<string, string>();

      for (const [blockId, block] of func.blocks) {
        if (
          block.instructions.length === 0 &&
          block.terminator.kind === "jump"
        ) {
          jumpTargets.set(blockId, block.terminator.target);
        }
      }

      // Track jump redirections for phi updates
      const redirections = new Map<string, Map<string, string>>();

      // Update all references to skip intermediate jumps
      for (const [blockId, block] of func.blocks) {
        if (block.terminator.kind === "jump") {
          const originalTarget = block.terminator.target;
          const finalTarget = this.resolveJumpChain(
            originalTarget,
            jumpTargets,
          );
          if (finalTarget !== originalTarget) {
            // Track this redirection: blockId was going to originalTarget, now goes to finalTarget
            if (!redirections.has(finalTarget)) {
              redirections.set(finalTarget, new Map());
            }
            redirections.get(finalTarget)!.set(blockId, originalTarget);

            context.trackTransformation({
              type: "replace",
              pass: this.name,
              original: Ir.Utils.extractContexts(block),
              result: Ir.Utils.extractContexts(block),
              reason: `Optimized jump chain: ${originalTarget} -> ${finalTarget}`,
            });
            block.terminator.target = finalTarget;
          }
        } else if (block.terminator.kind === "branch") {
          const originalTrue = block.terminator.trueTarget;
          const trueFinal = this.resolveJumpChain(originalTrue, jumpTargets);
          const originalFalse = block.terminator.falseTarget;
          const falseFinal = this.resolveJumpChain(originalFalse, jumpTargets);

          if (trueFinal !== originalTrue) {
            // Track this redirection
            if (!redirections.has(trueFinal)) {
              redirections.set(trueFinal, new Map());
            }
            redirections.get(trueFinal)!.set(blockId, originalTrue);

            context.trackTransformation({
              type: "replace",
              pass: this.name,
              original: Ir.Utils.extractContexts(block),
              result: Ir.Utils.extractContexts(block),
              reason: `Optimized true branch jump chain: ${originalTrue} -> ${trueFinal}`,
            });
            block.terminator.trueTarget = trueFinal;
          }
          if (falseFinal !== originalFalse) {
            // Track this redirection
            if (!redirections.has(falseFinal)) {
              redirections.set(falseFinal, new Map());
            }
            redirections.get(falseFinal)!.set(blockId, originalFalse);

            context.trackTransformation({
              type: "replace",
              pass: this.name,
              original: Ir.Utils.extractContexts(block),
              result: Ir.Utils.extractContexts(block),
              reason: `Optimized false branch jump chain: ${originalFalse} -> ${falseFinal}`,
            });
            block.terminator.falseTarget = falseFinal;
          }
        }
      }

      // Update phi nodes for redirected jumps
      this.updatePhisForRedirections(func, redirections, jumpTargets);

      // Remove unreachable blocks
      const reachable = this.findReachableBlocks(func);
      const blocksToRemove: string[] = [];

      for (const blockId of func.blocks.keys()) {
        if (!reachable.has(blockId)) {
          blocksToRemove.push(blockId);
          const block = func.blocks.get(blockId)!;
          context.trackTransformation({
            type: "delete",
            pass: this.name,
            original: Ir.Utils.extractContexts(block),
            result: [],
            reason: `Removed unreachable block ${blockId}`,
          });
        }
      }

      for (const blockId of blocksToRemove) {
        func.blocks.delete(blockId);
      }
    });

    return optimized;
  }

  private resolveJumpChain(
    target: string,
    jumpTargets: Map<string, string>,
  ): string {
    const visited = new Set<string>();
    let current = target;

    while (jumpTargets.has(current) && !visited.has(current)) {
      visited.add(current);
      current = jumpTargets.get(current)!;
    }

    return current;
  }

  private updatePhisForRedirections(
    func: Ir.Function,
    redirections: Map<string, Map<string, string>>,
    jumpTargets: Map<string, string>,
  ): void {
    // For each block that has redirected jumps coming into it
    for (const [targetBlock, sourceMap] of redirections) {
      const block = func.blocks.get(targetBlock);
      if (!block) continue;

      // Update phi nodes in this block
      for (const phi of block.phis) {
        const newSources = new Map(phi.sources);

        // For each redirection (newSource was going to oldSource, now goes here)
        for (const [newSource, oldSource] of sourceMap) {
          // If the phi had a value from oldSource, we need to update it
          if (phi.sources.has(oldSource)) {
            // Get the value that was coming from oldSource
            const value = phi.sources.get(oldSource)!;

            // Check if oldSource was a jump-only block that might have phi nodes
            const oldBlock = func.blocks.get(oldSource);
            if (oldBlock && oldBlock.phis.length > 0) {
              // We need to thread through the phi values from the intermediate block
              // This is complex - for now, we'll just copy the value
              // A more sophisticated approach would thread through phi values
              newSources.set(newSource, value);
            } else {
              // Simple case: just redirect the source
              newSources.set(newSource, value);
            }

            // If oldSource is being removed (it's a jump-only block), remove it from phi
            if (jumpTargets.has(oldSource)) {
              newSources.delete(oldSource);
            }
          }
        }

        phi.sources = newSources;
      }

      // Update predecessors list as well
      const newPredecessors = new Set<string>();
      for (const pred of block.predecessors) {
        // If this predecessor was redirected, use the original source
        let found = false;
        for (const [newSource, oldSource] of sourceMap) {
          if (oldSource === pred) {
            newPredecessors.add(newSource);
            found = true;
          }
        }
        if (!found && !jumpTargets.has(pred)) {
          // Keep predecessors that weren't redirected and aren't being removed
          newPredecessors.add(pred);
        }
      }
      // Add any new predecessors from redirections
      for (const newSource of sourceMap.keys()) {
        newPredecessors.add(newSource);
      }
      block.predecessors = newPredecessors;
    }
  }

  private findReachableBlocks(func: Ir.Function): Set<string> {
    const reachable = new Set<string>();
    const worklist = [func.entry];

    while (worklist.length > 0) {
      const blockId = worklist.pop()!;
      if (reachable.has(blockId)) continue;

      reachable.add(blockId);
      const block = func.blocks.get(blockId);
      if (!block) continue;

      // Add successors to worklist
      if (block.terminator.kind === "jump") {
        worklist.push(block.terminator.target);
      } else if (block.terminator.kind === "branch") {
        worklist.push(block.terminator.trueTarget);
        worklist.push(block.terminator.falseTarget);
      } else if (block.terminator.kind === "call") {
        // Call instructions have a continuation block
        worklist.push(block.terminator.continuation);
      }
    }

    return reachable;
  }
}
