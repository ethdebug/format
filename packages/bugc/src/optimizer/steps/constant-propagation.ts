import * as Ir from "#ir";
import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class ConstantPropagationStep extends BaseOptimizationStep {
  name = "constant-propagation";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Track known constant values and their debug info across the function
      const constants = new Map<string, bigint | boolean | string>();
      const constantDebug = new Map<string, Ir.Instruction.Debug>();

      for (const block of func.blocks.values()) {
        const newInstructions: Ir.Instruction[] = [];

        for (const inst of block.instructions) {
          let newInst = inst;

          // Track constant assignments and their debug info
          if (inst.kind === "const" && "dest" in inst) {
            constants.set(inst.dest, inst.value);
            if (inst.operationDebug) {
              constantDebug.set(inst.dest, inst.operationDebug);
            }
          } else {
            // Try to propagate constants into instruction operands
            const propagated = this.propagateConstantsIntoInstruction(
              inst,
              constants,
              constantDebug,
            );
            if (propagated !== inst) {
              newInst = propagated;

              context.trackTransformation({
                type: "replace",
                pass: this.name,
                original: Ir.Utils.extractContexts(inst),
                result: Ir.Utils.extractContexts(newInst),
                reason: "Propagated constants into instruction operands",
              });
            }

            // Clear constant info if instruction has side effects
            if (this.hasSideEffects(inst)) {
              // Conservative: clear all constant info
              // A more sophisticated analysis would track what's invalidated
              constants.clear();
              constantDebug.clear();
            }
          }

          newInstructions.push(newInst);
        }

        block.instructions = newInstructions;
      }
    });

    return optimized;
  }

  private propagateConstantsIntoInstruction(
    inst: Ir.Instruction,
    constants: Map<string, bigint | boolean | string>,
    constantDebug: Map<string, Ir.Instruction.Debug>,
  ): Ir.Instruction {
    // Clone instruction and replace temp operands with constants where possible
    const result = { ...inst };
    const propagatedDebugContexts: Ir.Instruction.Debug[] = [];

    const propagateValue = (value: Ir.Value): Ir.Value => {
      if (value.kind === "temp") {
        const constValue = constants.get(value.id);
        if (constValue !== undefined) {
          // Track debug info from the constant definition
          const debug = constantDebug.get(value.id);
          if (debug) {
            propagatedDebugContexts.push(debug);
          }
          return {
            kind: "const",
            value: constValue,
            type: value.type || this.getTypeForValue(constValue),
          };
        }
      }
      return value;
    };

    // Apply propagation based on instruction type
    switch (result.kind) {
      case "binary":
        result.left = propagateValue(result.left);
        result.right = propagateValue(result.right);
        break;
      case "unary":
        result.operand = propagateValue(result.operand);
        break;
      case "write":
        if (result.slot) result.slot = propagateValue(result.slot);
        if (result.value) result.value = propagateValue(result.value);
        if (result.offset) result.offset = propagateValue(result.offset);
        if (result.length) result.length = propagateValue(result.length);
        break;
      case "read":
        if (result.slot) result.slot = propagateValue(result.slot);
        if (result.offset) result.offset = propagateValue(result.offset);
        if (result.length) result.length = propagateValue(result.length);
        break;
      case "compute_slot":
        result.base = propagateValue(result.base);
        if (Ir.Instruction.ComputeSlot.isMapping(result)) {
          result.key = propagateValue(result.key);
        } else if (Ir.Instruction.ComputeSlot.isArray(result)) {
          // Array compute_slot no longer has index field
        }
        break;
      case "hash":
        result.value = propagateValue(result.value);
        break;
      case "cast":
        result.value = propagateValue(result.value);
        break;
      case "compute_offset":
        result.base = propagateValue(result.base);
        if (Ir.Instruction.ComputeOffset.isArray(result)) {
          result.index = propagateValue(result.index);
        } else if (Ir.Instruction.ComputeOffset.isByte(result)) {
          result.offset = propagateValue(result.offset);
        }
        // Field type doesn't have any Values to propagate (fieldOffset is a number)
        break;
      case "allocate":
        result.size = propagateValue(result.size);
        break;
      case "length":
        result.object = propagateValue(result.object);
        break;
    }

    // Check if we actually changed anything
    const changed = propagatedDebugContexts.length > 0;

    // If we propagated constants, combine debug contexts
    if (changed) {
      result.operationDebug = Ir.Utils.combineDebugContexts(
        inst.operationDebug,
        ...propagatedDebugContexts,
      );
    }

    return changed ? result : inst;
  }

  private getTypeForValue(value: bigint | boolean | string): Ir.Type {
    if (typeof value === "boolean") {
      return Ir.Type.Scalar.bool;
    } else if (typeof value === "bigint") {
      return Ir.Type.Scalar.uint256;
    } else {
      // Strings are references in the new type system
      return Ir.Type.Ref.memory();
    }
  }

  private hasSideEffects(inst: Ir.Instruction): boolean {
    switch (inst.kind) {
      case "write":
        return true;
      default:
        return false;
    }
  }
}
