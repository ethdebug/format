/**
 * IR Statistics analyzer
 */

import * as Ir from "#ir/spec";

export interface Statistics {
  blockCount: number;
  instructionCount: number;
  tempCount: number;
  parameterCount: number;
  maxBlockSize: number;
  avgBlockSize: number;
  cfgEdges: number;
  instructionTypes: Record<string, number>;
  criticalPaths: Statistics.PathInfo[];
  dominatorTree: Record<string, string | null>;
  loopInfo: Statistics.LoopInfo[];
}

export namespace Statistics {
  export interface PathInfo {
    from: string;
    to: string;
    length: number;
    blocks: string[];
  }

  export interface LoopInfo {
    header: string;
    blocks: string[];
    depth: number;
  }

  export class Analyzer {
    analyze(module: Ir.Module): Statistics {
      const func = module.main;
      const blocks = Array.from(func.blocks.values());

      // Basic counts
      const blockCount = blocks.length;
      const instructions = blocks.flatMap((b) => b.instructions);
      const instructionCount = instructions.length;

      // Instruction type distribution
      const instructionTypes: Record<string, number> = {};
      for (const inst of instructions) {
        instructionTypes[inst.kind] = (instructionTypes[inst.kind] || 0) + 1;
      }

      // Block sizes
      const blockSizes = blocks.map((b) => b.instructions.length + 1); // +1 for terminator
      const maxBlockSize = Math.max(...blockSizes);
      const avgBlockSize = blockSizes.reduce((a, b) => a + b, 0) / blockCount;

      // Count temporaries and parameters
      const tempCount = this.countTemporaries(func);
      const parameterCount = func.parameters.length;

      // CFG edges
      const cfgEdges = this.countCfgEdges(func);

      // Advanced analyses
      const dominatorTree = this.computeDominatorTree(func);
      const criticalPaths = this.findCriticalPaths(func);
      const loopInfo = this.detectLoops(func, dominatorTree);

      return {
        blockCount,
        instructionCount,
        tempCount,
        parameterCount,
        maxBlockSize,
        avgBlockSize: Math.round(avgBlockSize * 10) / 10,
        cfgEdges,
        instructionTypes,
        criticalPaths,
        dominatorTree,
        loopInfo,
      };
    }

    private countTemporaries(func: Ir.Function): number {
      const temps = new Set<string>();

      for (const block of func.blocks.values()) {
        for (const inst of block.instructions) {
          // Check destinations
          if ("dest" in inst && inst.dest) {
            temps.add(inst.dest);
          }

          // Check value uses
          this.collectTempsFromValue(inst, temps);
        }

        // Check terminator
        if (block.terminator.kind === "branch") {
          this.collectTempsFromValueRef(block.terminator.condition, temps);
        } else if (
          block.terminator.kind === "return" &&
          block.terminator.value
        ) {
          this.collectTempsFromValueRef(block.terminator.value, temps);
        }
      }

      return temps.size;
    }

    private collectTempsFromValue(
      inst: Ir.Instruction,
      temps: Set<string>,
    ): void {
      const valueFields = [
        "value",
        "left",
        "right",
        "operand",
        "object",
        "array",
        "index",
        "key",
      ];

      for (const field of valueFields) {
        if (field in inst) {
          const fieldValue = (inst as unknown as Record<string, unknown>)[
            field
          ];
          if (fieldValue) {
            this.collectTempsFromValueRef(fieldValue, temps);
          }
        }
      }
    }

    private collectTempsFromValueRef(
      value: Ir.Value | unknown,
      temps: Set<string>,
    ): void {
      if (
        typeof value === "object" &&
        value &&
        "kind" in value &&
        value.kind === "temp"
      ) {
        temps.add((value as { kind: "temp"; id: string }).id);
      }
    }

    private countCfgEdges(func: Ir.Function): number {
      let edges = 0;

      for (const block of func.blocks.values()) {
        switch (block.terminator.kind) {
          case "jump":
            edges += 1;
            break;
          case "branch":
            edges += 2;
            break;
          // return has no edges
        }
      }

      return edges;
    }

    private computeDominatorTree(
      func: Ir.Function,
    ): Record<string, string | null> {
      // Implement the standard iterative dominator tree algorithm
      const dominators: Record<string, string | null> = {};
      const blockIds = Array.from(func.blocks.keys());

      // Build predecessor map for efficiency
      const predecessors: Record<string, string[]> = {};
      for (const blockId of blockIds) {
        predecessors[blockId] = Array.from(
          func.blocks.get(blockId)?.predecessors || [],
        );
      }

      // Entry block dominates itself (has no dominator)
      dominators[func.entry] = null;

      // Initialize all other blocks to undefined (not yet computed)
      for (const blockId of blockIds) {
        if (blockId !== func.entry) {
          dominators[blockId] = undefined!; // Will be computed
        }
      }

      // Iterative algorithm - repeat until fixed point
      let changed = true;
      while (changed) {
        changed = false;

        // Process blocks in a reasonable order (BFS from entry)
        const worklist = [func.entry];
        const processed = new Set<string>([func.entry]);

        while (worklist.length > 0) {
          const current = worklist.shift()!;
          const block = func.blocks.get(current);
          if (!block) continue;

          // Add successors to worklist
          const successors = this.getSuccessors(block);
          for (const succ of successors) {
            if (!processed.has(succ)) {
              worklist.push(succ);
              processed.add(succ);
            }
          }

          // Skip entry block
          if (current === func.entry) continue;

          // Find immediate dominator
          const preds = predecessors[current] || [];
          if (preds.length === 0) continue; // Unreachable block

          // Find first predecessor with a dominator
          let newDom: string | undefined;
          for (const pred of preds) {
            if (dominators[pred] !== undefined) {
              newDom = pred;
              break;
            }
          }

          if (newDom === undefined) continue; // No processed predecessors yet

          // Intersect with other predecessors
          for (const pred of preds) {
            if (pred !== newDom && dominators[pred] !== undefined) {
              newDom = this.intersectDominators(pred, newDom, dominators);
            }
          }

          // Update if changed
          if (dominators[current] !== newDom) {
            dominators[current] = newDom;
            changed = true;
          }
        }
      }

      return dominators;
    }

    private intersectDominators(
      b1: string,
      b2: string,
      dominators: Record<string, string | null>,
    ): string {
      // Find common dominator of b1 and b2
      let finger1: string | null = b1;
      let finger2: string | null = b2;

      // Create paths from both blocks to entry
      const path1 = new Set<string>();
      while (finger1 !== null) {
        path1.add(finger1);
        finger1 = dominators[finger1] ?? null;
      }

      // Find first common ancestor
      while (finger2 !== null) {
        if (path1.has(finger2)) {
          return finger2;
        }
        finger2 = dominators[finger2] ?? null;
      }

      // Should never happen if CFG is well-formed
      throw new Error("No common dominator found - CFG may be disconnected");
    }

    private findCriticalPaths(func: Ir.Function): PathInfo[] {
      const paths: PathInfo[] = [];
      const visited = new Set<string>();

      // Find longest paths from entry to returns
      const findPaths = (
        blockId: string,
        path: string[],
        length: number,
      ): void => {
        if (visited.has(blockId)) return;

        const block = func.blocks.get(blockId);
        if (!block) return;

        const newPath = [...path, blockId];
        const newLength = length + block.instructions.length + 1;

        if (block.terminator.kind === "return") {
          paths.push({
            from: func.entry,
            to: blockId,
            length: newLength,
            blocks: newPath,
          });
          return;
        }

        visited.add(blockId);

        // Explore successors
        const successors = this.getSuccessors(block);
        for (const succ of successors) {
          findPaths(succ, newPath, newLength);
        }

        visited.delete(blockId);
      };

      findPaths(func.entry, [], 0);

      // Sort by length and return top 3
      return paths.sort((a, b) => b.length - a.length).slice(0, 3);
    }

    private detectLoops(
      func: Ir.Function,
      dominators: Record<string, string | null>,
    ): LoopInfo[] {
      const loops: LoopInfo[] = [];

      // Find back edges (proper loop detection)
      for (const [blockId, block] of func.blocks.entries()) {
        const successors = this.getSuccessors(block);

        for (const succ of successors) {
          // Check if this is a back edge
          if (this.dominates(succ, blockId, dominators)) {
            // Found a loop with header at succ
            const loopBlocks = this.findLoopBlocks(succ, blockId, func);
            loops.push({
              header: succ,
              blocks: loopBlocks,
              depth: 0, // Will be computed later
            });
          }
        }
      }

      // Compute loop depths by checking containment
      this.computeLoopDepths(loops);

      return loops;
    }

    private computeLoopDepths(loops: LoopInfo[]): void {
      // For each loop, count how many other loops contain it
      for (let i = 0; i < loops.length; i++) {
        let depth = 1; // Base depth is 1

        // Check if this loop is contained within any other loop
        for (let j = 0; j < loops.length; j++) {
          if (i !== j && this.isLoopContainedIn(loops[i], loops[j])) {
            depth++;
          }
        }

        loops[i].depth = depth;
      }
    }

    private isLoopContainedIn(inner: LoopInfo, outer: LoopInfo): boolean {
      // A loop is contained in another if its header is part of the outer loop's blocks
      return outer.blocks.includes(inner.header);
    }

    private dominates(
      a: string,
      b: string,
      dominators: Record<string, string | null>,
    ): boolean {
      // Check if a dominates b
      let current: string | null = b;
      while (current !== null) {
        if (current === a) return true;
        current = dominators[current] || null;
      }
      return false;
    }

    private findLoopBlocks(
      header: string,
      tail: string,
      func: Ir.Function,
    ): string[] {
      // Find all blocks in the loop (simplified)
      const loopBlocks = new Set<string>([header, tail]);
      const worklist = [tail];

      while (worklist.length > 0) {
        const blockId = worklist.pop()!;
        const block = func.blocks.get(blockId);
        if (!block) continue;

        for (const pred of block.predecessors) {
          if (!loopBlocks.has(pred)) {
            loopBlocks.add(pred);
            if (pred !== header) {
              worklist.push(pred);
            }
          }
        }
      }

      return Array.from(loopBlocks);
    }

    private getSuccessors(block: Ir.Block): string[] {
      switch (block.terminator.kind) {
        case "jump":
          return [block.terminator.target];
        case "branch":
          return [block.terminator.trueTarget, block.terminator.falseTarget];
        case "return":
          return [];
        default:
          return [];
      }
    }
  }
}
