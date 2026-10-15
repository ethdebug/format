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
          block.phis.length === 0 &&
          block.terminator.kind === "jump" &&
          this.passActivations(func, blockId)
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
          // A branch must not skip ahead into a block that has phis:
          // if both its edges reached that block, the block's phis
          // would need two values from this one predecessor.
          const originalTrue = block.terminator.trueTarget;
          const trueFinal = this.resolveBranchTarget(
            func,
            originalTrue,
            jumpTargets,
          );
          const originalFalse = block.terminator.falseTarget;
          const falseFinal = this.resolveBranchTarget(
            func,
            originalFalse,
            jumpTargets,
          );

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

      // Update phi nodes for redirected jumps. A skipped block goes
      // away only if nothing reaches it any more.
      const reachable = this.findReachableBlocks(func);
      this.updatePhisForRedirections(
        func,
        redirections,
        jumpTargets,
        reachable,
      );

      // Remove unreachable blocks
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

  /**
   * Whether a jump-only block may be skipped with respect to the
   * `invoke` or `return` its jump carries (an inlined body's, with no
   * instruction to carry it): only if each block that reaches it does
   * so by a plain jump, which runs only on that path, and takes the
   * markers. The block is kept otherwise. A jump-only block takes
   * none, as it may be skipped too: this one stays, for now.
   */
  private passActivations(func: Ir.Function, blockId: string): boolean {
    const block = func.blocks.get(blockId)!;
    const debug = block.terminator.operationDebug;
    if (!Ir.Utils.carriesActivations(debug)) return true;
    if (blockId === func.entry) return false;

    const jumps: Ir.Block[] = [];
    for (const [id, from] of func.blocks) {
      const t = from.terminator;
      const reaches =
        (t.kind === "jump" && t.target === blockId) ||
        (t.kind === "branch" &&
          (t.trueTarget === blockId || t.falseTarget === blockId)) ||
        (t.kind === "call" && t.continuation === blockId);
      if (!reaches) continue;
      if (t.kind !== "jump" || t.tailCall) return false;
      if (
        id !== func.entry &&
        from.instructions.length === 0 &&
        from.phis.length === 0
      ) {
        return false;
      }
      jumps.push(from);
    }
    const moved = jumps.map(
      (from) =>
        Ir.Utils.moveActivations(debug, {
          before: from.terminator.operationDebug,
        })?.before,
    );
    if (jumps.length === 0 || moved.some((m) => !m)) return false;
    jumps.forEach((from, i) => {
      from.terminator = { ...from.terminator, operationDebug: moved[i]! };
    });
    block.terminator = {
      ...block.terminator,
      operationDebug: Ir.Utils.withoutActivationsDebug(debug),
    };
    return true;
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

  private resolveBranchTarget(
    func: Ir.Function,
    target: string,
    jumpTargets: Map<string, string>,
  ): string {
    const final = this.resolveJumpChain(target, jumpTargets);
    const finalBlock = func.blocks.get(final);
    return finalBlock && finalBlock.phis.length > 0 ? target : final;
  }

  private updatePhisForRedirections(
    func: Ir.Function,
    redirections: Map<string, Map<string, string>>,
    jumpTargets: Map<string, string>,
    reachable: Set<string>,
  ): void {
    // A redirected block takes over the phi source of the last block
    // it skipped, the one that jumped to the target
    for (const [targetBlock, sourceMap] of redirections) {
      const block = func.blocks.get(targetBlock);
      if (!block) continue;

      for (const phi of block.phis) {
        const newSources = new Map(phi.sources);
        for (const [newSource, oldSource] of sourceMap) {
          const lastSkipped = this.lastJumpBefore(
            oldSource,
            targetBlock,
            jumpTargets,
          );
          const value = phi.sources.get(lastSkipped);
          if (value) {
            newSources.set(newSource, value);
          }
        }
        phi.sources = newSources;
      }

      block.predecessors = new Set([
        ...block.predecessors,
        ...sourceMap.keys(),
      ]);
    }

    // Forget the skipped blocks that nothing reaches any more
    for (const block of func.blocks.values()) {
      const removed = (id: string) => jumpTargets.has(id) && !reachable.has(id);
      for (const phi of block.phis) {
        phi.sources = new Map([...phi.sources].filter(([id]) => !removed(id)));
      }
      block.predecessors = new Set(
        [...block.predecessors].filter((id) => !removed(id)),
      );
    }
  }

  /**
   * In the jump chain from `start` to `target`, find the block that
   * jumps to `target` itself
   */
  private lastJumpBefore(
    start: string,
    target: string,
    jumpTargets: Map<string, string>,
  ): string {
    const visited = new Set<string>();
    let current = start;

    while (
      jumpTargets.has(current) &&
      jumpTargets.get(current) !== target &&
      !visited.has(current)
    ) {
      visited.add(current);
      current = jumpTargets.get(current)!;
    }

    return current;
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
