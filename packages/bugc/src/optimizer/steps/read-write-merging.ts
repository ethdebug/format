import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class ReadWriteMergingStep extends BaseOptimizationStep {
  name = "read-write-merging";
  private nextTempCounter = 0;

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Find the highest temp number in the module
    this.nextTempCounter = this.findHighestTempNumber(optimized) + 1;

    this.processAllFunctions(optimized, (func) => {
      for (const block of func.blocks.values()) {
        const newInstructions: Ir.Instruction[] = [];
        let i = 0;

        while (i < block.instructions.length) {
          const inst = block.instructions[i];

          if (inst.kind === "write") {
            // Try to find consecutive writes that can be merged
            const mergeGroup = this.findMergeableWrites(block.instructions, i);

            if (mergeGroup.length > 1) {
              // Merge the writes
              const merged = this.mergeWrites(mergeGroup, context);
              newInstructions.push(...merged);
              i += mergeGroup.length;
            } else {
              newInstructions.push(inst);
              i++;
            }
          } else {
            newInstructions.push(inst);
            i++;
          }
        }

        block.instructions = newInstructions;
      }
    });

    return optimized;
  }

  /**
   * Find the highest temp number in the module
   */
  private findHighestTempNumber(module: Ir.Module): number {
    let highest = -1;

    const checkValue = (value: Ir.Value) => {
      if (value.kind === "temp") {
        const match = value.id.match(/^t(\d+)$/);
        if (match) {
          highest = Math.max(highest, parseInt(match[1], 10));
        }
      }
    };

    const checkInstruction = (inst: Ir.Instruction) => {
      // Check dest
      if ("dest" in inst && typeof inst.dest === "string") {
        const match = inst.dest.match(/^t(\d+)$/);
        if (match) {
          highest = Math.max(highest, parseInt(match[1], 10));
        }
      }

      // Check values in instruction
      if ("left" in inst && inst.left && typeof inst.left === "object")
        checkValue(inst.left);
      if ("right" in inst && inst.right && typeof inst.right === "object")
        checkValue(inst.right);
      if ("value" in inst && inst.value && typeof inst.value === "object")
        checkValue(inst.value);
      if ("operand" in inst && inst.operand && typeof inst.operand === "object")
        checkValue(inst.operand);
      if ("slot" in inst && inst.slot && typeof inst.slot === "object")
        checkValue(inst.slot);
      if ("offset" in inst && inst.offset && typeof inst.offset === "object")
        checkValue(inst.offset);
      if ("length" in inst && inst.length && typeof inst.length === "object")
        checkValue(inst.length);
      if ("base" in inst && inst.base && typeof inst.base === "object")
        checkValue(inst.base);
      if ("key" in inst && inst.key && typeof inst.key === "object")
        checkValue(inst.key);
      if ("index" in inst && inst.index && typeof inst.index === "object")
        checkValue(inst.index);
      if ("size" in inst && inst.size && typeof inst.size === "object")
        checkValue(inst.size);
      if ("object" in inst && inst.object && typeof inst.object === "object")
        checkValue(inst.object);
    };

    this.processAllFunctions(module, (func) => {
      for (const block of func.blocks.values()) {
        // Check phis
        if (block.phis) {
          for (const phi of block.phis) {
            const match = phi.dest.match(/^t(\d+)$/);
            if (match) {
              highest = Math.max(highest, parseInt(match[1], 10));
            }
            for (const value of phi.sources.values()) {
              checkValue(value);
            }
          }
        }

        // Check instructions
        for (const inst of block.instructions) {
          checkInstruction(inst);
        }

        // Check terminator
        if ("condition" in block.terminator && block.terminator.condition) {
          checkValue(block.terminator.condition);
        }
        if ("value" in block.terminator && block.terminator.value) {
          checkValue(block.terminator.value);
        }
      }
    });

    return highest;
  }

  /**
   * Find consecutive write instructions that can be merged
   */
  private findMergeableWrites(
    instructions: Ir.Instruction[],
    startIndex: number,
  ): Ir.Instruction.Write[] {
    const writes: Ir.Instruction.Write[] = [];
    const firstWrite = instructions[startIndex];

    if (firstWrite.kind !== "write") return writes;

    writes.push(firstWrite);

    // Look ahead for more writes to the same location
    for (let i = startIndex + 1; i < instructions.length; i++) {
      const inst = instructions[i];

      // Stop if we hit a non-write instruction
      if (inst.kind !== "write") break;

      // Check if this write can be merged with the group
      if (this.canMergeWith(firstWrite, inst)) {
        writes.push(inst);
      } else {
        break;
      }
    }

    return writes;
  }

  /**
   * Check if two writes can be merged
   */
  private canMergeWith(
    first: Ir.Instruction.Write,
    second: Ir.Instruction.Write,
  ): boolean {
    // Must be same location type
    if (first.location !== second.location) return false;

    // For storage/transient: must have same slot
    if (first.location === "storage" || first.location === "transient") {
      if (!first.slot || !second.slot) return false;
      if (!this.isSameValue(first.slot, second.slot)) return false;

      // Both must have constant offsets and lengths for now
      if (
        first.offset?.kind !== "const" ||
        first.length?.kind !== "const" ||
        second.offset?.kind !== "const" ||
        second.length?.kind !== "const"
      ) {
        return false;
      }

      return true;
    }

    // For memory: would need to check if addresses are related
    // For now, only support storage/transient merging
    return false;
  }

  /**
   * Check if two values are the same
   */
  private isSameValue(a: Ir.Value, b: Ir.Value): boolean {
    if (a.kind !== b.kind) return false;

    if (a.kind === "const" && b.kind === "const") {
      return a.value === b.value;
    }

    if (a.kind === "temp" && b.kind === "temp") {
      return a.id === b.id;
    }

    return false;
  }

  /**
   * Merge multiple write instructions into optimized sequence
   */
  private mergeWrites(
    writes: Ir.Instruction.Write[],
    context: OptimizationContext,
  ): Ir.Instruction[] {
    if (writes.length === 1) return writes;

    // Extract offset and length info
    type WriteInfo = {
      write: Ir.Instruction.Write;
      offset: bigint;
      length: bigint;
    };

    const writeInfos: WriteInfo[] = writes.map((write) => ({
      write,
      offset: write.offset?.kind === "const" ? BigInt(write.offset.value) : 0n,
      length: write.length?.kind === "const" ? BigInt(write.length.value) : 32n,
    }));

    // Sort by offset
    writeInfos.sort((a, b) => Number(a.offset - b.offset));

    // Check if writes are adjacent or overlapping (for simple merging)
    const canSimpleMerge = this.areWritesAdjacent(writeInfos);

    if (!canSimpleMerge) {
      // For non-adjacent writes, keep them separate for now
      return writes;
    }

    // Generate instructions to combine the values
    const instructions: Ir.Instruction[] = [];
    let tempCounter = this.nextTempCounter;
    let combinedValue: Ir.Value | null = null;
    let combinedDebug: Ir.Instruction.Debug = {};

    for (let i = 0; i < writeInfos.length; i++) {
      const info = writeInfos[i];
      const shiftBits = info.offset * 8n;

      // Track debug contexts as we process writes
      combinedDebug = Ir.Utils.combineDebugContexts(
        combinedDebug,
        info.write.operationDebug,
      );

      if (shiftBits > 0n) {
        // Need to shift the value
        const shiftTemp = `t${tempCounter++}`;
        instructions.push({
          kind: "binary",
          op: "shl",
          left: info.write.value,
          right: {
            kind: "const",
            value: shiftBits,
            type: Ir.Type.Scalar.uint256,
          },
          dest: shiftTemp,
          operationDebug: combinedDebug,
        });

        const shiftedValue: Ir.Value = {
          kind: "temp",
          id: shiftTemp,
          type: Ir.Type.Scalar.uint256,
        };

        if (combinedValue === null) {
          combinedValue = shiftedValue;
        } else {
          // OR with previous combined value
          const orTemp = `t${tempCounter++}`;
          instructions.push({
            kind: "binary",
            op: "or",
            left: combinedValue,
            right: shiftedValue,
            dest: orTemp,
            operationDebug: combinedDebug,
          });
          combinedValue = {
            kind: "temp",
            id: orTemp,
            type: Ir.Type.Scalar.uint256,
          };
        }
      } else {
        // No shift needed
        if (combinedValue === null) {
          combinedValue = info.write.value;
        } else {
          // OR with previous combined value
          const orTemp = `t${tempCounter++}`;
          instructions.push({
            kind: "binary",
            op: "or",
            left: combinedValue,
            right: info.write.value,
            dest: orTemp,
            operationDebug: combinedDebug,
          });
          combinedValue = {
            kind: "temp",
            id: orTemp,
            type: Ir.Type.Scalar.uint256,
          };
        }
      }
    }

    // Calculate the merged write parameters
    const minOffset = writeInfos[0].offset;
    const maxEnd = writeInfos.reduce((max, info) => {
      const end = info.offset + info.length;
      return end > max ? end : max;
    }, minOffset + writeInfos[0].length);
    const totalLength = maxEnd - minOffset;

    // Create merged write instruction
    const mergedWrite: Ir.Instruction.Write = {
      kind: "write",
      location: writes[0].location,
      slot: writes[0].slot,
      offset:
        minOffset > 0n
          ? { kind: "const", value: minOffset, type: Ir.Type.Scalar.uint256 }
          : undefined,
      length: {
        kind: "const",
        value: totalLength,
        type: Ir.Type.Scalar.uint256,
      },
      value: combinedValue!,
      operationDebug: combinedDebug,
    };

    instructions.push(mergedWrite);

    // Update the temp counter for next time
    this.nextTempCounter = tempCounter;

    // Track transformation
    context.trackTransformation({
      type: "merge",
      pass: this.name,
      original: Ir.Utils.extractContexts(...writes),
      result: Ir.Utils.extractContexts(...instructions),
      reason: `Merged ${writes.length} writes to same location`,
    });

    return instructions;
  }

  /**
   * Check if writes are adjacent or can be easily combined
   */
  private areWritesAdjacent(writeInfos: WriteInfo[]): boolean {
    for (let i = 1; i < writeInfos.length; i++) {
      const prev = writeInfos[i - 1];
      const curr = writeInfos[i];

      // Check if current write starts at or before previous write ends
      if (curr.offset > prev.offset + prev.length) {
        // Gap between writes - not adjacent
        return false;
      }
    }
    return true;
  }
}

type WriteInfo = {
  write: Ir.Instruction.Write;
  offset: bigint;
  length: bigint;
};
