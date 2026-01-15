import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class DeadCodeEliminationStep extends BaseOptimizationStep {
  name = "dead-code-elimination";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Collect all used values for this function
      const usedValues = new Set<string>();

      for (const block of func.blocks.values()) {
        // Analyze phi uses
        if (block.phis) {
          for (const phi of block.phis) {
            this.collectUsedValues(phi, usedValues);
          }
        }

        // Analyze instruction uses
        for (const inst of block.instructions) {
          this.collectUsedValues(inst, usedValues);
        }

        // Analyze terminator uses
        if (block.terminator.kind === "branch") {
          this.collectValueUse(block.terminator.condition, usedValues);
        } else if (
          block.terminator.kind === "return" &&
          block.terminator.value
        ) {
          this.collectValueUse(block.terminator.value, usedValues);
        } else if (block.terminator.kind === "call") {
          // Collect argument uses
          for (const arg of block.terminator.arguments) {
            this.collectValueUse(arg, usedValues);
          }
        }
      }

      // Remove dead instructions
      for (const block of func.blocks.values()) {
        // Remove dead phi nodes
        if (block.phis) {
          const newPhis = block.phis.filter((phi) => {
            if (!usedValues.has(phi.dest)) {
              context.trackTransformation({
                type: "delete",
                pass: this.name,
                original: Ir.Utils.extractContexts(phi),
                result: [],
                reason: `Removed unused phi node: ${phi.dest}`,
              });
              return false;
            }
            return true;
          });
          block.phis = newPhis;
        }

        // Remove dead instructions
        const newInstructions: Ir.Instruction[] = [];

        for (const inst of block.instructions) {
          if (this.hasSideEffects(inst)) {
            newInstructions.push(inst); // Keep instructions with side effects
          } else if (
            "dest" in inst &&
            inst.dest &&
            !usedValues.has(inst.dest)
          ) {
            // Dead instruction - track its removal
            context.trackTransformation({
              type: "delete",
              pass: this.name,
              original: Ir.Utils.extractContexts(inst),
              result: [],
              reason: `Removed unused instruction: ${inst.kind} -> ${inst.dest}`,
            });
          } else {
            newInstructions.push(inst);
          }
        }

        block.instructions = newInstructions;
      }
    });

    return optimized;
  }

  private collectUsedValues(
    inst: Ir.Block.Phi | Ir.Instruction,
    used: Set<string>,
  ): void {
    switch (inst.kind) {
      case "binary":
        this.collectValueUse(inst.left, used);
        this.collectValueUse(inst.right, used);
        break;
      case "unary":
        this.collectValueUse(inst.operand, used);
        break;
      case "write":
        if (inst.slot) this.collectValueUse(inst.slot, used);
        if (inst.value) this.collectValueUse(inst.value, used);
        if (inst.offset) this.collectValueUse(inst.offset, used);
        if (inst.length) this.collectValueUse(inst.length, used);
        break;
      case "read":
        if (inst.slot) this.collectValueUse(inst.slot, used);
        if (inst.offset) this.collectValueUse(inst.offset, used);
        if (inst.length) this.collectValueUse(inst.length, used);
        break;
      case "compute_slot":
        this.collectValueUse(inst.base, used);
        if (Ir.Instruction.ComputeSlot.isMapping(inst)) {
          this.collectValueUse(inst.key, used);
        } else if (Ir.Instruction.ComputeSlot.isArray(inst)) {
          // Array compute_slot no longer has index field
        }
        break;
      case "hash":
        this.collectValueUse(inst.value, used);
        break;
      case "cast":
        this.collectValueUse(inst.value, used);
        break;
      // Call instruction removed - calls are now block terminators
      case "length":
        this.collectValueUse(inst.object, used);
        break;
      case "compute_offset":
        this.collectValueUse(inst.base, used);
        if (Ir.Instruction.ComputeOffset.isArray(inst)) {
          this.collectValueUse(inst.index, used);
        } else if (Ir.Instruction.ComputeOffset.isByte(inst)) {
          this.collectValueUse(inst.offset, used);
        }
        // Field type doesn't have any Values to collect (fieldOffset is a number)
        break;
      case "allocate":
        this.collectValueUse(inst.size, used);
        break;
      case "phi":
        for (const value of inst.sources.values()) {
          this.collectValueUse(value, used);
        }
        break;
    }
  }

  private collectValueUse(value: Ir.Value, used: Set<string>): void {
    if (value.kind === "temp") {
      used.add(value.id);
    }
  }

  private hasSideEffects(inst: Ir.Instruction): boolean {
    switch (inst.kind) {
      case "write":
      case "allocate": // Allocate modifies the free memory pointer
        return true;
      default:
        return false;
    }
  }
}
