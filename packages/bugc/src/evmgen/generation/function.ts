/**
 * Function-level code generation
 */

import type * as Format from "@ethdebug/format";
import * as Ir from "#ir";
import type * as Evm from "#evm";
import type { Stack } from "#evm";

import type { State } from "#evmgen/state";
import type { Layout, Memory } from "#evmgen/analysis";
import type { Error as EvmgenError } from "#evmgen/errors";

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

    // Add JUMPDEST with function entry annotation.
    // After this JUMPDEST executes, the callee's args are
    // on the stack (first arg deepest).
    const argPointers = params.map((p, i) => ({
      ...(p.name ? { name: p.name } : {}),
      location: "stack" as const,
      slot: params.length - 1 - i,
    }));

    // Build declaration source range if available
    const declaration =
      func.loc && func.sourceId
        ? {
            source: { id: func.sourceId },
            range: func.loc,
          }
        : undefined;

    const entryInvoke: Format.Program.Context.Invoke = {
      invoke: {
        jump: true as const,
        identifier: func.name || "anonymous",
        ...(declaration ? { declaration } : {}),
        target: {
          pointer: {
            location: "stack" as const,
            slot: 0,
          },
        },
        ...(argPointers.length > 0 && {
          arguments: {
            pointer: {
              group: argPointers,
            },
          },
        }),
      },
    };
    const entryDebug = {
      context: entryInvoke as Format.Program.Context,
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

    const prologueDebug =
      func.sourceId && func.loc
        ? {
            context: {
              gather: [
                {
                  remark: `prologue: store ${params.length} parameter(s) to memory`,
                },
                {
                  code: {
                    source: { id: func.sourceId },
                    range: func.loc,
                  },
                },
              ],
            } as Format.Program.Context,
          }
        : {
            context: {
              remark: `prologue: store ${params.length} parameter(s) to memory`,
            } as Format.Program.Context,
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
          {
            mnemonic: "MSTORE",
            opcode: 0x52,
            debug: prologueDebug,
          },
        ],
      };
    }

    // Save the return PC from 0x60 to a dedicated slot
    // so nested function calls don't clobber it.
    const savedPcOffset = currentState.memory.savedReturnPcOffset;
    if (savedPcOffset !== undefined) {
      const savePcDebug =
        func.sourceId && func.loc
          ? {
              context: {
                gather: [
                  {
                    remark: `prologue: save return PC to 0x${savedPcOffset.toString(16)}`,
                  },
                  {
                    code: {
                      source: { id: func.sourceId },
                      range: func.loc,
                    },
                  },
                ],
              } as Format.Program.Context,
            }
          : {
              context: {
                remark: `prologue: save return PC to 0x${savedPcOffset.toString(16)}`,
              } as Format.Program.Context,
            };
      const highByte = (savedPcOffset >> 8) & 0xff;
      const lowByte = savedPcOffset & 0xff;
      currentState = {
        ...currentState,
        instructions: [
          ...currentState.instructions,
          {
            mnemonic: "PUSH1",
            opcode: 0x60,
            immediates: [0x60],
            debug: savePcDebug,
          },
          {
            mnemonic: "MLOAD",
            opcode: 0x51,
            debug: savePcDebug,
          },
          {
            mnemonic: "PUSH2",
            opcode: 0x61,
            immediates: [highByte, lowByte],
            debug: savePcDebug,
          },
          {
            mnemonic: "MSTORE",
            opcode: 0x52,
            debug: savePcDebug,
          },
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
  options: {
    isUserFunction?: boolean;
    functions?: Map<string, Ir.Function>;
  } = {},
): {
  instructions: Evm.Instruction[];
  bytecode: number[];
  warnings: EvmgenError[];
  patches: State<Stack>["patches"];
  blockOffsets: Record<string, number>;
} {
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
        options.functions,
      )(state);
    },
    stateAfterPrologue,
  );

  // For user functions, defer block/continuation patching
  // to module level where the function's base offset is known.
  // Block offsets computed here are relative to the function
  // start; EVM JUMP needs absolute program counter values.
  if (options.isUserFunction) {
    const bytecode = serialize(finalState.instructions);
    return {
      instructions: finalState.instructions,
      bytecode,
      warnings: finalState.warnings,
      patches: finalState.patches,
      blockOffsets: finalState.blockOffsets,
    };
  }

  // Patch block jump targets (not function calls yet)
  const patchedState = patchJumps(finalState);

  // Serialize to bytecode
  const bytecode = serialize(patchedState.instructions);

  return {
    instructions: patchedState.instructions,
    bytecode,
    warnings: patchedState.warnings,
    patches: finalState.patches, // Return patches for module-level patching
    blockOffsets: finalState.blockOffsets,
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
 * Patch function call addresses in bytecode.
 *
 * When `baseOffset` is provided (for user-defined functions),
 * block/continuation patches are also resolved by adding
 * `baseOffset` to each block-relative target. This is
 * necessary because block offsets are computed relative to
 * the function's instruction stream, but EVM JUMP needs
 * absolute program counter values.
 */
export function patchFunctionCalls(
  bytecode: number[],
  instructions: Evm.Instruction[],
  patches: State<Stack>["patches"],
  functionRegistry: Record<string, number>,
  options: {
    baseOffset?: number;
    blockOffsets?: Record<string, number>;
  } = {},
): { bytecode: number[]; instructions: Evm.Instruction[] } {
  const patchedInstructions = [...instructions];
  const patchedBytecode = [...bytecode];

  for (const patch of patches) {
    let targetOffset: number | undefined;

    if (patch.type === "function") {
      targetOffset = functionRegistry[patch.target];
      if (targetOffset === undefined) {
        throw new Error(`Function ${patch.target} not found in registry`);
      }
    } else if (options.baseOffset !== undefined && options.blockOffsets) {
      // Block or continuation patch with base offset
      const blockOffset = options.blockOffsets[patch.target];
      if (blockOffset === undefined) {
        throw new Error(`Jump target ${patch.target} not found`);
      }
      targetOffset = blockOffset + options.baseOffset;
    } else {
      // Skip non-function patches when no base offset
      continue;
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
