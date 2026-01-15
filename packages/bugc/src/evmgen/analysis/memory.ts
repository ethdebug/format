/**
 * Memory Planning for EVM Code Generation
 *
 * Allocates memory slots for values that need to persist across
 * stack operations or block boundaries.
 */

import { BugError } from "#errors";
import type { SourceLocation } from "#ast";
import * as Ir from "#ir";
import { Result, Severity } from "#result";

import type * as Liveness from "./liveness.js";

export enum ErrorCode {
  STACK_TOO_DEEP = "MEMORY_STACK_TOO_DEEP",
  ALLOCATION_FAILED = "MEMORY_ALLOCATION_FAILED",
  INVALID_LAYOUT = "MEMORY_INVALID_LAYOUT",
}

class MemoryError extends BugError {
  constructor(code: ErrorCode, message: string, location?: SourceLocation) {
    super(message, code, location, Severity.Error);
  }
}

export { MemoryError as Error };

/**
 * EVM memory layout following Solidity conventions
 */
export const regions = {
  SCRATCH_SPACE_1: 0x00, // 0x00-0x1f: First scratch space slot
  SCRATCH_SPACE_2: 0x20, // 0x20-0x3f: Second scratch space slot
  FREE_MEMORY_POINTER: 0x40, // 0x40-0x5f: Dynamic memory pointer
  ZERO_SLOT: 0x60, // 0x60-0x7f: Zero slot (reserved)
  STATIC_MEMORY_START: 0x80, // 0x80+: Static allocations start here
} as const;

export interface Allocation {
  /** Memory offset in bytes */
  offset: number;
  /** Size in bytes */
  size: number;
}

export namespace Module {
  /**
   * Module-level memory information
   */
  export interface Info {
    create?: Function.Info;
    main: Function.Info;
    functions: {
      [functionName: string]: Function.Info;
    };
  }

  /**
   * Analyze memory requirements for entire module
   */
  export function plan(
    module: Ir.Module,
    liveness: Liveness.Module.Info,
  ): Result<Module.Info, MemoryError> {
    const result: Module.Info = {
      main: {} as Function.Info,
      functions: {},
    };

    // Process constructor if present
    if (module.create && liveness.create) {
      const createMemory = Function.plan(module.create, liveness.create);
      if (!createMemory.success) {
        return createMemory;
      }
      result.create = createMemory.value;
    }

    // Process main function
    if (!liveness.main) {
      return Result.err(
        new MemoryError(
          ErrorCode.INVALID_LAYOUT,
          "Missing liveness info for main function",
        ),
      );
    }
    const mainMemory = Function.plan(module.main, liveness.main);
    if (!mainMemory.success) {
      return mainMemory;
    }
    result.main = mainMemory.value;

    // Process user-defined functions
    for (const [name, func] of module.functions) {
      const funcLiveness = liveness.functions[name];
      if (!funcLiveness) {
        return Result.err(
          new MemoryError(
            ErrorCode.INVALID_LAYOUT,
            `Missing liveness info for function ${name}`,
          ),
        );
      }
      const funcMemory = Function.plan(func, funcLiveness);
      if (!funcMemory.success) {
        return funcMemory;
      }
      result.functions[name] = funcMemory.value;
    }

    return Result.ok(result);
  }
}

export namespace Function {
  export interface Info {
    /** Memory allocation info for each value that needs allocation */
    allocations: Record<string, Allocation>;
    /** Next available memory offset after all static allocations */
    nextStaticOffset: number;
  }

  /**
   * Plan memory layout for a function with type-aware packing
   */
  export function plan(
    func: Ir.Function,
    liveness: Liveness.Function.Info,
  ): Result<Function.Info, MemoryError> {
    try {
      const allocations: Record<string, Allocation> = {};
      let nextStaticOffset = regions.STATIC_MEMORY_START;

      const needsMemory = identifyMemoryValues(func, liveness);

      // Also allocate memory for all parameters (they always need memory)
      for (const param of func.parameters || []) {
        needsMemory.set(param.tempId, param.type);
      }

      // Check if we have too many values for memory
      if (needsMemory.size > 1000) {
        return Result.err(
          new MemoryError(
            ErrorCode.ALLOCATION_FAILED,
            `Too many values need memory allocation: ${needsMemory.size}`,
          ),
        );
      }

      // Sort values by size (largest first) for better packing
      const sortedValues = Array.from(needsMemory.entries()).sort(
        ([_a, typeA], [_b, typeB]) => getTypeSize(typeB) - getTypeSize(typeA),
      );

      // Track current slot usage for packing
      let currentSlotOffset = nextStaticOffset;
      let currentSlotUsed = 0;
      const SLOT_SIZE = 32;

      for (const [valueId, type] of sortedValues) {
        const size = getTypeSize(type);

        // If this value needs a full slot or won't fit in current slot, start new slot
        if (size >= SLOT_SIZE || currentSlotUsed + size > SLOT_SIZE) {
          if (currentSlotUsed > 0) {
            // Move to next slot if current slot has something
            currentSlotOffset += SLOT_SIZE;
            currentSlotUsed = 0;
          }
        }

        // Allocate in current slot
        allocations[valueId] = {
          offset: currentSlotOffset + currentSlotUsed,
          size: size,
        };

        currentSlotUsed += size;

        // If we filled the slot exactly, prepare for next slot
        if (currentSlotUsed >= SLOT_SIZE) {
          currentSlotOffset += SLOT_SIZE;
          currentSlotUsed = 0;
        }
      }

      // Update next static offset to next available slot
      if (currentSlotUsed > 0) {
        nextStaticOffset = currentSlotOffset + SLOT_SIZE;
      } else {
        nextStaticOffset = currentSlotOffset;
      }

      return Result.ok({
        allocations,
        nextStaticOffset,
      });
    } catch (error) {
      return Result.err(
        new MemoryError(
          ErrorCode.ALLOCATION_FAILED,
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
    }
  }
}

/**
 * Simulate stack effects of an instruction
 */
function simulateInstruction(stack: string[], inst: Ir.Instruction): string[] {
  const newStack = [...stack];

  // Pop consumed values based on instruction type
  switch (inst.kind) {
    case "binary":
    case "hash":
      newStack.pop(); // Two operands
      newStack.pop();
      break;
    case "compute_slot":
      // Depends on kind
      newStack.pop(); // base
      if (
        inst.kind === "compute_slot" &&
        Ir.Instruction.ComputeSlot.isMapping(inst)
      ) {
        newStack.pop(); // key for mappings
      }
      break;
    case "unary":
    case "cast":
    case "length":
      newStack.pop(); // One operand
      break;
    // NEW: unified read - pops slot/offset/length as needed
    case "read":
      if (inst.slot) newStack.pop();
      if (inst.offset) newStack.pop();
      if (inst.length) newStack.pop();
      break;
    // NEW: unified write - pops slot/offset/length/value as needed
    case "write":
      if (inst.slot) newStack.pop();
      if (inst.offset) newStack.pop();
      if (inst.length) newStack.pop();
      newStack.pop(); // value
      break;
    // NEW: compute offset
    case "compute_offset":
      newStack.pop(); // base
      if (Ir.Instruction.ComputeOffset.isArray(inst)) {
        newStack.pop(); // index
      } else if (Ir.Instruction.ComputeOffset.isByte(inst)) {
        newStack.pop(); // offset
      }
      // Field type doesn't pop any additional values (fieldOffset is a number)
      break;
    // Call instruction removed - calls are now block terminators
    // These don't pop anything
    case "const":
    case "env":
      break;
  }

  // Push produced value
  if ("dest" in inst && inst.dest) {
    newStack.push(inst.dest);
  }

  return newStack;
}

/**
 * Get the ID from a Value
 */
function valueId(val: Ir.Value): string {
  if (val.kind === "const") {
    return `$const_${val.value}`;
  } else if (val.kind === "temp") {
    return val.id;
  } else {
    // @ts-expect-error should be exhausted
    throw new Error(`Unknown value kind: ${val.kind}`);
  }
}

/**
 * Collect all values used by an instruction
 */
function getUsedValues(inst: Ir.Instruction): Set<string> {
  const used = new Set<string>();

  // Helper to add a value if it's not a constant
  const addValue = (val: Ir.Value | undefined): void => {
    if (val && val.kind !== "const") {
      used.add(valueId(val));
    }
  };

  // Check instruction type and extract used values
  switch (inst.kind) {
    case "binary":
      addValue(inst.left);
      addValue(inst.right);
      break;
    case "unary":
      addValue(inst.operand);
      break;
    case "compute_slot":
      addValue(inst.base);
      if (Ir.Instruction.ComputeSlot.isMapping(inst)) {
        addValue(inst.key);
      }
      break;
    case "cast":
      addValue(inst.value);
      break;
    case "length":
      addValue(inst.object);
      break;
    case "hash":
      addValue(inst.value);
      break;
    // Call instruction removed - calls are now block terminators
  }

  return used;
}

/**
 * Find position of value in stack (0 = top)
 */
function findStackPosition(stack: string[], value: string): number {
  const index = stack.lastIndexOf(value);
  return index === -1 ? -1 : stack.length - 1 - index;
}

/**
 * Get the size in bytes for a given type
 */
function getTypeSize(type: Ir.Type): number {
  switch (type.kind) {
    case "scalar":
      // Scalar types have their size directly
      return type.size;
    case "ref":
      // References are always 32-byte pointers on the stack
      return 32;
    default:
      return 32; // Conservative default
  }
}

/**
 * Get type information for a value ID
 */
function getValueType(valueId: string, func: Ir.Function): Ir.Type | undefined {
  // Check if it's a parameter
  for (const param of func.parameters || []) {
    if (param.tempId === valueId) {
      return param.type;
    }
  }

  // Search through instructions for the definition
  for (const [_, block] of func.blocks) {
    // Check phi nodes
    for (const phi of block.phis) {
      if (phi.dest === valueId) {
        return phi.type;
      }
    }

    // Check instructions
    for (const inst of block.instructions) {
      if ("dest" in inst && inst.dest === valueId) {
        // Get type based on instruction kind
        if ("type" in inst && inst.type) {
          return inst.type as Ir.Type;
        }
        // For instructions without explicit type, infer from operation
        if (inst.kind === "binary" || inst.kind === "unary") {
          // Binary/unary ops typically produce uint256
          return Ir.Type.Scalar.uint256;
        }
        if (inst.kind === "env") {
          // Environment ops produce address or uint256
          return inst.op === "msg_sender"
            ? Ir.Type.Scalar.address
            : Ir.Type.Scalar.uint256;
        }
      }
    }
  }

  return undefined;
}

/**
 * Identify values that need memory allocation with their types
 */
function identifyMemoryValues(
  func: Ir.Function,
  liveness: Liveness.Function.Info,
): Map<string, Ir.Type> {
  const needsMemory = new Map<string, Ir.Type>();

  // All cross-block values need memory
  for (const value of liveness.crossBlockValues) {
    const type = getValueType(value, func);
    if (type) {
      needsMemory.set(value, type);
    }
  }

  // All phi destinations need memory
  for (const [_, block] of func.blocks) {
    for (const phi of block.phis) {
      needsMemory.set(phi.dest, phi.type);
    }
  }

  // Simulate stack to find values that might overflow
  for (const blockId of func.blocks.keys()) {
    const block = func.blocks.get(blockId)!;
    const liveAtEntry = liveness.liveIn.get(blockId) || new Set();

    // Start with live-in values on stack
    let stack: string[] = Array.from(liveAtEntry);

    for (const inst of block.instructions) {
      // Check if any used values are too deep in stack
      for (const usedId of getUsedValues(inst)) {
        const position = findStackPosition(stack, usedId);
        if (position > 16 || position === -1) {
          const type = getValueType(usedId, func);
          if (type) {
            needsMemory.set(usedId, type);
          }
        }
      }

      // Values used in compute_slot need memory for hashing
      if (inst.kind === "compute_slot" && inst.slotKind === "array") {
        // The base might need to be preserved
        const baseId = valueId(inst.base);
        if (liveAtEntry.has(baseId)) {
          const type = getValueType(baseId, func);
          if (type) {
            needsMemory.set(baseId, type);
          }
        }
      }

      // Simulate the instruction's effect on stack
      stack = simulateInstruction(stack, inst);

      // If stack is getting too deep, spill bottom values
      if (stack.length > 14) {
        // Conservative threshold
        // Mark bottom values as needing memory
        for (let i = 0; i < stack.length - 14; i++) {
          const type = getValueType(stack[i], func);
          if (type) {
            needsMemory.set(stack[i], type);
          }
        }
      }
    }

    // Check terminator usage
    const term = block.terminator;
    if (term.kind === "branch" && term.condition.kind !== "const") {
      const condId = valueId(term.condition);
      const position = findStackPosition(stack, condId);
      if (position > 16 || position === -1) {
        const type = getValueType(condId, func);
        if (type) {
          needsMemory.set(condId, type);
        }
      }
    }
  }

  return needsMemory;
}
