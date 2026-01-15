import * as Ir from "#ir";

import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

export class CommonSubexpressionEliminationStep extends BaseOptimizationStep {
  name = "common-subexpression-elimination";

  run(module: Ir.Module, context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);

    // Process each function separately
    this.processAllFunctions(optimized, (func) => {
      // Compute dominator tree for this function
      const analyzer = new Ir.Analysis.Statistics.Analyzer();
      const analysis = analyzer.analyze({ ...module, main: func });
      const dominators = analysis.dominatorTree;

      // Global replacements map for the entire function
      const globalReplacements = new Map<string, string>();
      // Pure expressions that persist across side effects
      // Maps expression -> {instruction, blockId}
      const pureExpressions = new Map<
        string,
        { instruction: Ir.Instruction; block: string }
      >();

      // Process blocks in topological order to ensure dominators are
      // processed first
      const orderedBlocks = this.topologicalSort(func);

      for (const blockId of orderedBlocks) {
        const block = func.blocks.get(blockId);
        if (!block) continue;
        // Map of expression -> instruction that computes it
        // (cleared on side effects)
        const expressions = new Map<string, Ir.Instruction>();
        const newInstructions: Ir.Instruction[] = [];

        for (const inst of block.instructions) {
          // Apply any replacements to this instruction
          const processedInst = this.applyReplacements(
            inst,
            globalReplacements,
          );

          if (
            processedInst.kind === "binary" ||
            processedInst.kind === "unary" ||
            processedInst.kind === "compute_slot" ||
            processedInst.kind === "env"
          ) {
            // Create a canonical representation of the expression
            const exprKey = this.getExpressionKey(processedInst);
            const isPure =
              processedInst.kind === "compute_slot" ||
              processedInst.kind === "env";

            // Check if we've seen this expression before
            let existingInst: Ir.Instruction | undefined;
            if (isPure) {
              // For pure expressions, check if we have a dominating
              // definition
              const pureEntry = pureExpressions.get(exprKey);
              if (
                pureEntry &&
                this.dominates(pureEntry.block, blockId, dominators)
              ) {
                existingInst = pureEntry.instruction;
              } else {
                // Fall back to local expressions in this block
                existingInst = expressions.get(exprKey);
              }
            } else {
              // Non-pure expressions only within the same block
              existingInst = expressions.get(exprKey);
            }

            if (
              existingInst &&
              "dest" in processedInst &&
              "dest" in existingInst
            ) {
              // This is a duplicate - combine debug contexts
              existingInst.operationDebug = Ir.Utils.combineDebugContexts(
                existingInst.operationDebug,
                processedInst.operationDebug,
              );

              // Map this temp to the existing one
              globalReplacements.set(processedInst.dest, existingInst.dest);

              context.trackTransformation({
                type: "delete",
                pass: this.name,
                original: Ir.Utils.extractContexts(processedInst),
                result: [],
                reason: `Eliminated duplicate computation: ${exprKey}`,
              });
              // Don't emit this instruction
            } else {
              // First time seeing this expression
              if ("dest" in processedInst && exprKey) {
                expressions.set(exprKey, processedInst);
                if (isPure) {
                  pureExpressions.set(exprKey, {
                    instruction: processedInst,
                    block: blockId,
                  });
                }
              }
              newInstructions.push(processedInst);
            }
          } else if (this.hasSideEffects(processedInst)) {
            // Instructions with side effects invalidate our expression
            // tracking
            expressions.clear();
            newInstructions.push(processedInst);
          } else {
            newInstructions.push(processedInst);
          }
        }

        block.instructions = newInstructions;
      }

      // Now apply replacements to phi nodes and terminators in a second
      // pass
      for (const block of func.blocks.values()) {
        // Apply replacements to phi nodes
        for (const phi of block.phis) {
          if (phi.sources) {
            for (const [blockId, value] of phi.sources) {
              const newValue = this.applyValueReplacement(
                value,
                globalReplacements,
              );
              phi.sources.set(blockId, newValue);
            }
          }
        }

        // Also apply replacements to the terminator
        if (block.terminator.kind === "branch") {
          block.terminator.condition = this.applyValueReplacement(
            block.terminator.condition,
            globalReplacements,
          );
        } else if (
          block.terminator.kind === "return" &&
          block.terminator.value
        ) {
          block.terminator.value = this.applyValueReplacement(
            block.terminator.value,
            globalReplacements,
          );
        }
      }
    });

    return optimized;
  }

  private applyValueReplacement(
    value: Ir.Value,
    replacements: Map<string, string>,
  ): Ir.Value {
    if (value.kind === "temp" && replacements.has(value.id)) {
      return {
        kind: "temp",
        id: replacements.get(value.id)!,
        type: value.type,
      };
    }
    return value;
  }

  private applyReplacements(
    inst: Ir.Instruction,
    replacements: Map<string, string>,
  ): Ir.Instruction {
    // Clone the instruction and replace any temp references
    const result = { ...inst };

    // Helper to replace a value
    const replaceValue = (value: Ir.Value): Ir.Value => {
      if (value.kind === "temp" && replacements.has(value.id)) {
        return {
          kind: "temp",
          id: replacements.get(value.id)!,
          type: value.type,
        };
      }
      return value;
    };

    // Apply replacements based on instruction type
    switch (result.kind) {
      case "binary":
        result.left = replaceValue(result.left);
        result.right = replaceValue(result.right);
        break;
      case "unary":
        result.operand = replaceValue(result.operand);
        break;
      case "write":
        if (result.slot) result.slot = replaceValue(result.slot);
        if (result.value) result.value = replaceValue(result.value);
        if (result.offset) result.offset = replaceValue(result.offset);
        if (result.length) result.length = replaceValue(result.length);
        break;
      case "read":
        if (result.slot) result.slot = replaceValue(result.slot);
        if (result.offset) result.offset = replaceValue(result.offset);
        if (result.length) result.length = replaceValue(result.length);
        break;
      case "compute_slot":
        result.base = replaceValue(result.base);
        if (Ir.Instruction.ComputeSlot.isMapping(result)) {
          result.key = replaceValue(result.key);
        } else if (Ir.Instruction.ComputeSlot.isArray(result)) {
          // Array compute_slot no longer has index field
        }
        break;
      case "hash":
        result.value = replaceValue(result.value);
        break;
      case "length":
        result.object = replaceValue(result.object);
        break;
    }

    return result;
  }

  private getExpressionKey(inst: Ir.Instruction): string {
    if (inst.kind === "binary") {
      const leftKey = this.getValueKey(inst.left);
      const rightKey = this.getValueKey(inst.right);
      const leftTypeKey = this.getTypeKey(inst.left.type);
      const rightTypeKey = this.getTypeKey(inst.right.type);

      // For commutative operations, normalize the order
      if (this.isCommutative(inst.op) && leftKey > rightKey) {
        return `${inst.op}(${rightKey}:${rightTypeKey},${leftKey}:${leftTypeKey})`;
      }
      return `${inst.op}(${leftKey}:${leftTypeKey},${rightKey}:${rightTypeKey})`;
    } else if (inst.kind === "unary") {
      const operandKey = this.getValueKey(inst.operand);
      const typeKey = this.getTypeKey(inst.operand.type);
      return `${inst.op}(${operandKey}:${typeKey})`;
    } else if (inst.kind === "compute_slot") {
      // Create a unique key for compute_slot instructions
      const baseKey = this.getValueKey(inst.base);

      if (inst.slotKind === "field") {
        return `compute_slot:field(${baseKey},${inst.fieldOffset})`;
      } else if (inst.slotKind === "mapping") {
        const keyKey = this.getValueKey(inst.key);
        const keyTypeKey = inst.keyType
          ? this.getTypeKey(inst.keyType)
          : "unknown";
        return `compute_slot:mapping(${baseKey},${keyKey}:${keyTypeKey})`;
      } else if (inst.slotKind === "array") {
        // Array compute_slot only depends on base now
        return `compute_slot:array(${baseKey})`;
      }
    } else if (inst.kind === "env") {
      // Environment values are constant during execution
      return `env:${inst.op}`;
    }
    return "";
  }

  private getValueKey(value: Ir.Value): string {
    if (value.kind === "const") {
      return `const:${value.value}`;
    } else if (value.kind === "temp") {
      return `temp:${value.id}`;
    }
    return "unknown";
  }

  private getTypeKey(type: Ir.Value["type"]): string {
    if (!type) return "unknown";
    switch (type.kind) {
      case "scalar":
        return `scalar:${type.size}`;
      case "ref":
        return `ref:${type.location}`;
      default:
        return "unknown";
    }
  }

  private isCommutative(op: string): boolean {
    return ["add", "mul", "eq", "ne", "and", "or"].includes(op);
  }

  private hasSideEffects(inst: Ir.Instruction): boolean {
    switch (inst.kind) {
      case "write":
        return true;
      default:
        return false;
    }
  }

  private topologicalSort(func: Ir.Function): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (blockId: string): void => {
      if (visited.has(blockId)) return;
      visited.add(blockId);

      // Add current block first (pre-order)
      result.push(blockId);

      const block = func.blocks.get(blockId);
      if (!block) return;

      // Then visit successors
      const successors = this.getSuccessors(block);
      for (const succ of successors) {
        visit(succ);
      }
    };

    // Start from entry
    visit(func.entry);

    // Visit any unreachable blocks
    for (const blockId of func.blocks.keys()) {
      visit(blockId);
    }

    return result;
  }

  private getSuccessors(block: Ir.Block): string[] {
    switch (block.terminator.kind) {
      case "jump":
        return [block.terminator.target];
      case "branch":
        return [block.terminator.trueTarget, block.terminator.falseTarget];
      case "call":
        return [block.terminator.continuation];
      case "return":
        return [];
      default:
        return [];
    }
  }

  private dominates(
    a: string,
    b: string,
    dominators: Record<string, string | null>,
  ): boolean {
    // Check if block a dominates block b
    let current: string | null = b;
    while (current !== null) {
      if (current === a) return true;
      current = dominators[current] || null;
    }
    return false;
  }
}
