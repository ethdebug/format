/**
 * Function-level code generation
 */

import * as Ir from "#ir";
import type * as Evm from "#evm";
import type { Stack } from "#evm";

import type { State } from "#evmgen/state";
import type { Layout, Memory } from "#evmgen/analysis";

import * as Block from "./block.js";
import { serialize } from "../serialize.js";
import { type Transition } from "../operations.js";

/**
 * Generate prologue for user-defined functions
 * Stack on entry: [arg0] [arg1] ... [argN] [return_pc]
 * After prologue: empty stack, args stored in memory, return_pc at 0x60
 */
function generatePrologue<S extends Stack>(
  func: Ir.Function,
): Transition<S, readonly []> {
  const params = func.parameters || [];

  return ((state: State<S>): State<readonly []> => {
    let currentState = state;

    // Add JUMPDEST with function entry annotation
    const entryDebug = {
      context: {
        remark: `function-entry: ${func.name || "anonymous"}`,
      },
    };
    currentState = {
      ...currentState,
      instructions: [
        ...currentState.instructions,
        { mnemonic: "JUMPDEST", opcode: 0x5b, debug: entryDebug },
      ],
    };

    // Store each parameter to memory and pop from stack
    // Stack layout on entry: [arg0, arg1, ..., argN]
    // Return PC is already in memory at 0x60 (stored by caller)
    // Pop and store each arg from argN down to arg0

    const prologueDebug = {
      context: {
        remark: `prologue: store ${params.length} parameter(s) to memory`,
      },
    };

    for (let i = params.length - 1; i >= 0; i--) {
      const param = params[i];
      const allocation = currentState.memory.allocations[param.tempId];

      if (!allocation) continue;

      // Push memory offset
      const highByte = (allocation.offset >> 8) & 0xff;
      const lowByte = allocation.offset & 0xff;
      currentState = {
        ...currentState,
        instructions: [
          ...currentState.instructions,
          {
            mnemonic: "PUSH2",
            opcode: 0x61,
            immediates: [highByte, lowByte],
            debug: prologueDebug,
          },
        ],
      };

      // MSTORE pops arg and offset
      currentState = {
        ...currentState,
        instructions: [
          ...currentState.instructions,
          { mnemonic: "MSTORE", opcode: 0x52 },
        ],
      };
    }

    // Return with empty stack
    return {
      ...currentState,
      stack: [],
      brands: [],
    } as State<readonly []>;
  }) as Transition<S, readonly []>;
}

/**
 * Generate bytecode for a function
 */
export function generate(
  func: Ir.Function,
  memory: Memory.Function.Info,
  layout: Layout.Function.Info,
  options: { isUserFunction?: boolean } = {},
) {
  const initialState: State<readonly []> = {
    brands: [],
    stack: [],
    instructions: [],
    memory,
    nextId: 0,
    patches: [],
    blockOffsets: {},
    warnings: [],
    functionRegistry: {},
    callStackPointer: 0x60,
  };

  // Add prologue for user functions (not main/create)
  let stateAfterPrologue = initialState;
  if (options.isUserFunction) {
    const prologueTransition = generatePrologue(func);
    stateAfterPrologue = prologueTransition(initialState);
  }

  const finalState = layout.order.reduce(
    (state: State<Stack>, blockId: string, index: number) => {
      const block = func.blocks.get(blockId);
      if (!block) return state;

      // Determine predecessor for phi resolution
      // This is simplified - real implementation would track actual control flow
      const predecessor = index > 0 ? layout.order[index - 1] : undefined;

      // Check if this is the first or last block
      const isFirstBlock = index === 0;
      const isLastBlock = index === layout.order.length - 1;

      return Block.generate(
        block,
        predecessor,
        isLastBlock,
        isFirstBlock,
        options.isUserFunction || false,
        func,
      )(state);
    },
    stateAfterPrologue,
  );

  // Patch block jump targets (not function calls yet)
  const patchedState = patchJumps(finalState);

  // Serialize to bytecode
  const bytecode = serialize(patchedState.instructions);

  return {
    instructions: patchedState.instructions,
    bytecode,
    warnings: patchedState.warnings,
    patches: finalState.patches, // Return patches for module-level patching
  };
}

/**
 * Patch jump targets after all blocks have been generated
 */
function patchJumps<S extends Stack>(state: State<S>): State<S> {
  const patchedInstructions = [...state.instructions];

  for (const patch of state.patches) {
    // Skip function patches - they'll be handled at module level
    if (patch.type === "function") {
      continue;
    }

    // Both block jumps and continuation patches use blockOffsets
    const targetOffset = state.blockOffsets[patch.target];
    if (targetOffset === undefined) {
      throw new Error(`Jump target ${patch.target} not found`);
    }

    // Convert offset to bytes for PUSH2 (2 bytes, big-endian)
    const highByte = (targetOffset >> 8) & 0xff;
    const lowByte = targetOffset & 0xff;

    // Update the PUSH2 instruction at the patch index
    const instruction = patchedInstructions[patch.index];
    if (instruction && instruction.immediates) {
      instruction.immediates = [highByte, lowByte];
    }
  }

  return {
    ...state,
    instructions: patchedInstructions,
  };
}

/**
 * Patch function call addresses in bytecode
 */
export function patchFunctionCalls(
  bytecode: number[],
  instructions: Evm.Instruction[],
  patches: State<Stack>["patches"],
  functionRegistry: Record<string, number>,
): { bytecode: number[]; instructions: Evm.Instruction[] } {
  const patchedInstructions = [...instructions];
  const patchedBytecode = [...bytecode];

  for (const patch of patches) {
    // Only handle function patches
    if (patch.type !== "function") {
      continue;
    }

    const targetOffset = functionRegistry[patch.target];
    if (targetOffset === undefined) {
      throw new Error(`Function ${patch.target} not found in registry`);
    }

    // Convert offset to bytes for PUSH2 (2 bytes, big-endian)
    const highByte = (targetOffset >> 8) & 0xff;
    const lowByte = targetOffset & 0xff;

    // Update the PUSH2 instruction
    const instruction = patchedInstructions[patch.index];
    if (instruction && instruction.immediates) {
      instruction.immediates = [highByte, lowByte];
    }

    // Also patch in the bytecode
    // Find the instruction's position in bytecode
    let bytePos = 0;
    for (let i = 0; i < patch.index; i++) {
      const inst = instructions[i];
      bytePos += 1; // opcode
      if (inst.immediates) {
        bytePos += inst.immediates.length;
      }
    }
    // Skip opcode byte
    bytePos += 1;
    patchedBytecode[bytePos] = highByte;
    patchedBytecode[bytePos + 1] = lowByte;
  }

  return {
    bytecode: patchedBytecode,
    instructions: patchedInstructions,
  };
}
