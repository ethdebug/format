/**
 * IR Validator - checks IR consistency and correctness
 */

import * as Ir from "#ir/spec";

export class Validator {
  private errors: string[] = [];
  private warnings: string[] = [];
  private tempDefs: Set<string> = new Set();
  private tempUses: Set<string> = new Set();
  private blockIds: Set<string> = new Set();

  validate(module: Ir.Module): Validator.Result {
    this.errors = [];
    this.warnings = [];
    this.tempDefs = new Set();
    this.tempUses = new Set();
    this.blockIds = new Set();

    // Validate module structure
    this.validateModule(module);

    // Check for undefined temporaries
    this.checkUndefinedTemporaries();

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private validateModule(module: Ir.Module): void {
    // Check module has a name
    if (!module.name) {
      this.error("Module must have a name");
    }

    // Validate main function
    if (!module.main) {
      this.error("Module must have a main function");
    } else {
      this.validateFunction(module.main);
    }
  }

  private validateFunction(func: Ir.Function): void {
    // Collect all block IDs
    for (const blockId of func.blocks.keys()) {
      this.blockIds.add(blockId);
    }

    // Check entry block exists
    if (!func.blocks.has(func.entry)) {
      this.error(`Entry block '${func.entry}' not found in function`);
    }

    // Validate parameters
    for (const param of func.parameters) {
      if (!param.tempId || !param.name) {
        this.error("Parameter must have tempId and name");
      }
      this.tempDefs.add(param.tempId);
      this.validateType(param.type);
    }

    // Validate each block
    for (const [blockId, block] of func.blocks.entries()) {
      this.validateBlock(blockId, block, func);
    }

    // Check for unreachable blocks
    this.checkUnreachableBlocks(func);

    // Check predecessor consistency
    this.checkPredecessorConsistency(func);
  }

  private validateBlock(
    blockId: string,
    block: Ir.Block,
    _func: Ir.Function,
  ): void {
    // Validate instructions
    for (const inst of block.instructions) {
      this.validateInstruction(inst);
    }

    // Validate terminator
    this.validateTerminator(block.terminator);

    // Check terminator targets exist
    const targets = this.getTerminatorTargets(block.terminator);
    for (const target of targets) {
      if (!this.blockIds.has(target)) {
        this.error(
          `Block '${blockId}' jumps to non-existent block '${target}'`,
        );
      }
    }
  }

  private validateInstruction(inst: Ir.Instruction): void {
    // Check instruction has required fields
    if (!inst.kind) {
      this.error("Instruction must have a kind");
      return;
    }

    // Validate based on instruction type
    switch (inst.kind) {
      case "const":
        this.validateConstInstruction(inst);
        break;
      case "binary":
        this.validateBinaryInstruction(inst);
        break;
      case "unary":
        this.validateUnaryInstruction(inst);
        break;
      case "env":
        this.validateEnvInstruction(inst);
        break;
      case "compute_slot":
        this.validateComputeSlotInstruction(inst);
        break;
      case "hash":
        this.validateHashInstruction(inst);
        break;
      // Add more instruction validations as needed
    }
  }

  private validateConstInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "const") return;

    if (!inst.dest) {
      this.error("Const instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (inst.value === undefined) {
      this.error("Const instruction must have a value");
    }

    this.validateType(inst.type);
  }

  private validateBinaryInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "binary") return;

    if (!inst.dest) {
      this.error("Binary instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (!inst.op) {
      this.error("Binary instruction must have an operator");
    }

    if (!inst.left) {
      this.error("Binary instruction must have a left operand");
    } else {
      this.validateValue(inst.left);
    }

    if (!inst.right) {
      this.error("Binary instruction must have a right operand");
    } else {
      this.validateValue(inst.right);
    }
  }

  private validateUnaryInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "unary") return;

    if (!inst.dest) {
      this.error("Unary instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (!inst.op) {
      this.error("Unary instruction must have an operator");
    }

    if (!inst.operand) {
      this.error("Unary instruction must have an operand");
    } else {
      this.validateValue(inst.operand);
    }
  }

  private validateEnvInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "env") return;

    if (!inst.dest) {
      this.error("Env instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (!inst.op) {
      this.error("Env instruction must have an operation");
    }

    const validOps = [
      "msg_sender",
      "msg_value",
      "block_number",
      "block_timestamp",
    ];
    if (!validOps.includes(inst.op)) {
      this.error(`Invalid env operation '${inst.op}'`);
    }
  }

  private validateComputeSlotInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "compute_slot") return;

    if (!inst.dest) {
      this.error("Compute slot instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (!inst.base) {
      this.error("Compute slot instruction must have a base");
    } else {
      this.validateValue(inst.base);
    }

    // Validate based on slot kind
    if (Ir.Instruction.ComputeSlot.isMapping(inst)) {
      if (!inst.key) {
        this.error("Mapping compute_slot must have a key");
      } else {
        this.validateValue(inst.key);
      }
      if (!inst.keyType) {
        this.error("Mapping compute_slot must have a keyType");
      } else {
        this.validateType(inst.keyType);
      }
    } else if (Ir.Instruction.ComputeSlot.isArray(inst)) {
      // Array compute_slot now only computes the first slot (no index needed)
    } else if (Ir.Instruction.ComputeSlot.isField(inst)) {
      if (inst.fieldOffset === undefined) {
        this.error("Field compute_slot must have a fieldOffset");
      }
    } else {
      // This should never be reached due to exhaustive type checking
      const _exhaustive: never = inst;
      void _exhaustive;
      this.error(`Unknown compute_slot kind`);
    }
  }

  private validateHashInstruction(inst: Ir.Instruction): void {
    if (inst.kind !== "hash") return;

    if (!inst.dest) {
      this.error("Hash instruction must have a destination");
    } else {
      this.tempDefs.add(inst.dest);
    }

    if (!inst.value) {
      this.error("Hash instruction must have a value");
    } else {
      this.validateValue(inst.value);
    }
  }

  private validateTerminator(term: Ir.Block["terminator"]): void {
    if (!term.kind) {
      this.error("Terminator must have a kind");
      return;
    }

    switch (term.kind) {
      case "jump":
        if (!term.target) {
          this.error("Jump terminator must have a target");
        }
        break;

      case "branch":
        if (!term.condition) {
          this.error("Branch terminator must have a condition");
        } else {
          this.validateValue(term.condition);
        }
        if (!term.trueTarget) {
          this.error("Branch terminator must have a true target");
        }
        if (!term.falseTarget) {
          this.error("Branch terminator must have a false target");
        }
        break;

      case "return":
        if (term.value) {
          this.validateValue(term.value);
        }
        break;

      default:
        this.error(
          `Unknown terminator kind '${(term as unknown as { kind: string }).kind}'`,
        );
    }
  }

  private validateValue(value: Ir.Value): void {
    if (!value || typeof value !== "object") return;

    switch (value.kind) {
      case "temp":
        if (!value.id) {
          this.error("Temp value must have an id");
        } else {
          this.tempUses.add(value.id);
        }
        break;

      case "const":
        if (value.value === undefined) {
          this.error("Const value must have a value");
        }
        break;

      default:
        this.error(
          `Unknown value kind '${(value as unknown as { kind: string }).kind}'`,
        );
    }

    if (value.type) {
      this.validateType(value.type);
    }
  }

  private validateType(type: Ir.Type): void {
    if (!type || !type.kind) {
      this.error("Type must have a kind");
      return;
    }

    switch (type.kind) {
      case "scalar":
        if (!type.size || type.size < 1 || type.size > 32) {
          this.error(`Invalid scalar size: ${type.size}`);
        }
        if (!type.origin) {
          this.error("Scalar type must have an origin");
        }
        break;

      case "ref":
        if (!type.location) {
          this.error("Reference type must have a location");
        } else if (
          !["memory", "storage", "calldata", "returndata"].includes(
            type.location,
          )
        ) {
          this.error(`Invalid reference location: ${type.location}`);
        }
        if (!type.origin) {
          this.error("Reference type must have an origin");
        }
        break;

      default:
        this.error(
          `Unknown type kind '${(type as unknown as { kind: string }).kind}'`,
        );
    }
  }

  private checkUndefinedTemporaries(): void {
    for (const tempId of this.tempUses) {
      if (!this.tempDefs.has(tempId)) {
        this.error(`Use of undefined temporary '${tempId}'`);
      }
    }
  }

  private checkUnreachableBlocks(func: Ir.Function): void {
    const reachable = new Set<string>();
    const worklist = [func.entry];

    while (worklist.length > 0) {
      const blockId = worklist.pop()!;
      if (reachable.has(blockId)) continue;

      reachable.add(blockId);
      const block = func.blocks.get(blockId);
      if (!block) continue;

      const targets = this.getTerminatorTargets(block.terminator);
      worklist.push(...targets);
    }

    for (const blockId of func.blocks.keys()) {
      if (!reachable.has(blockId)) {
        this.warning(`Block '${blockId}' is unreachable`);
      }
    }
  }

  private checkPredecessorConsistency(func: Ir.Function): void {
    // Build actual predecessor sets
    const actualPreds = new Map<string, Set<string>>();

    for (const [blockId, block] of func.blocks.entries()) {
      const targets = this.getTerminatorTargets(block.terminator);
      for (const target of targets) {
        if (!actualPreds.has(target)) {
          actualPreds.set(target, new Set());
        }
        actualPreds.get(target)!.add(blockId);
      }
    }

    // Check consistency
    for (const [blockId, block] of func.blocks.entries()) {
      const expected = actualPreds.get(blockId) || new Set();
      const recorded = block.predecessors;

      // Check for missing predecessors
      for (const pred of expected) {
        if (!recorded.has(pred)) {
          this.error(`Block '${blockId}' missing predecessor '${pred}'`);
        }
      }

      // Check for extra predecessors
      for (const pred of recorded) {
        if (!expected.has(pred)) {
          this.error(`Block '${blockId}' has invalid predecessor '${pred}'`);
        }
      }
    }
  }

  private getTerminatorTargets(term: Ir.Block["terminator"]): string[] {
    switch (term.kind) {
      case "jump":
        return [term.target];
      case "branch":
        return [term.trueTarget, term.falseTarget];
      case "return":
        return [];
      default:
        return [];
    }
  }

  private error(message: string): void {
    this.errors.push(message);
  }

  private warning(message: string): void {
    this.warnings.push(message);
  }
}

export namespace Validator {
  export interface Result {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }
}
