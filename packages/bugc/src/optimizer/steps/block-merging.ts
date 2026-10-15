import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  recordDropped,
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

        // The jump between them goes, and the merged block's entry:
        // their invokes and returns move onto a neighbour on the path
        recordDropped(
          context,
          this.name,
          moveJumpActivations(targetBlock, sourceBlock, {
            isEntry: mergeInto === func.entry,
          }),
        );

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

          // Phis name their incoming edge by predecessor block
          for (const phi of block.phis) {
            renameKey(phi.sources, toMerge, mergeInto);
            if (phi.sourcesDebug) {
              renameKey(phi.sourcesDebug, toMerge, mergeInto);
            }
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

/**
 * Put the invokes and returns of the jump from `from` to `to`, and of
 * `to`'s entry, onto a neighbour on their path (see
 * `Ir.Utils.placeActivations`): `from`'s last instruction (or its
 * entry), or `to`'s first instruction (or its jump). The markers no
 * neighbour can take.
 */
function moveJumpActivations(
  from: Ir.Block,
  to: Ir.Block,
  { isEntry }: { isEntry: boolean },
): Ir.Utils.ActivationMarker[] {
  const jump = from.terminator.operationDebug;
  const entry = to.entryActivations;
  delete to.entryActivations;
  const markers = [...Ir.Utils.markersOf(jump), ...Ir.Utils.markersOf(entry)];
  if (markers.length === 0) return [];
  const returned =
    Ir.Utils.activationsOf(entry?.context, "return").length > 0
      ? entry?.returned
      : jump.returned;

  const last = from.instructions.at(-1);
  const first = to.instructions[0];
  const toJump =
    !first && to.terminator.kind === "jump" && !to.terminator.tailCall
      ? to.terminator
      : undefined;
  const before = last
    ? last.operationDebug
    : isEntry
      ? undefined
      : (from.entryActivations ?? {});
  const after = (first ?? toJump)?.operationDebug;
  const placed = Ir.Utils.placeActivations(markers, returned, {
    before,
    after,
  });
  if (placed.before !== before) {
    if (last) {
      from.instructions[from.instructions.length - 1] = {
        ...last,
        operationDebug: placed.before!,
      } as Ir.Instruction;
    } else {
      from.entryActivations = placed.before;
    }
  }
  if (placed.after !== after) {
    if (first) {
      to.instructions[0] = {
        ...first,
        operationDebug: placed.after!,
      } as Ir.Instruction;
    } else if (toJump) {
      to.terminator = { ...toJump, operationDebug: placed.after! };
    }
  }
  return placed.dropped;
}

function renameKey<V>(map: Map<string, V>, from: string, to: string): void {
  if (!map.has(from)) return;
  map.set(to, map.get(from)!);
  map.delete(from);
}
