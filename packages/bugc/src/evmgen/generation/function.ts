/**
 * Function-level code generation
 */

import type * as Format from "@ethdebug/format";
import * as Ir from "#ir";
import type * as Evm from "#evm";
import type { Stack } from "#evm";

import type { State } from "#evmgen/state";
import { type Layout, Memory } from "#evmgen/analysis";
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

    const d = makePrologueDebug(func);
    const frameSize = currentState.memory.frameSize;

    if (frameSize !== undefined) {
      // Allocate call frame from FMP and save context.
      // Stack on entry: [argN, ..., arg1, arg0]
      currentState = emitFrameAlloc(currentState, frameSize, d);
      // Stack: [new_fp, argN, ..., arg0]

      // Pop new_fp — it's now stored at FRAME_POINTER.
      currentState = emit(currentState, d, { mnemonic: "POP", opcode: 0x50 });
      // Stack: [argN, ..., arg0]

      // Store each param to its frame-relative slot.
      // PUSH FP; MLOAD; PUSH offset; ADD produces the
      // address on top; the arg is second; MSTORE
      // consumes both.
      for (let i = params.length - 1; i >= 0; i--) {
        const alloc = currentState.memory.allocations[params[i].tempId];
        if (!alloc) continue;
        currentState = emitFpRelativeStore(currentState, alloc.offset, d);
      }
    }

    // Return with empty stack
    return {
      ...currentState,
      stack: [],
      brands: [],
    } as State<readonly []>;
  }) as Transition<S, readonly []>;
}

// ----- prologue helpers -----

const { FRAME_POINTER, FREE_MEMORY_POINTER, RETURN_PC_SCRATCH } =
  Memory.regions;
const { SAVED_RETURN_PC } = Memory.frameHeader;

type Debug = Evm.Instruction["debug"];
type Inst = Omit<Evm.Instruction, "debug">;

/** Append instructions to state, attaching debug. */
function emit<S extends Stack>(
  state: State<S>,
  debug: Debug,
  ...instrs: Inst[]
): State<S> {
  return {
    ...state,
    instructions: [
      ...state.instructions,
      ...instrs.map((i) => ({ ...i, debug })),
    ],
  };
}

/** PUSH an integer as the smallest PUSHn. */
function pushImm(value: number, debug: Debug): Evm.Instruction[] {
  if (value === 0) {
    return [{ mnemonic: "PUSH0", opcode: 0x5f, debug }];
  }
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  const n = bytes.length;
  return [
    {
      mnemonic: `PUSH${n}`,
      opcode: 0x5f + n,
      immediates: bytes,
      debug,
    },
  ];
}

/**
 * Emit frame allocation sequence.
 *
 * Pushes new_fp onto the stack, bumps FMP, saves old FP
 * and return PC into the new frame, updates FRAME_POINTER.
 *
 * Stack effect: [...args] → [new_fp, ...args]
 */
function emitFrameAlloc<S extends Stack>(
  state: State<S>,
  frameSize: number,
  debug: Debug,
): State<S> {
  let s = state;

  // new_fp = mem[FMP]
  s = emit(s, debug, ...pushImm(FREE_MEMORY_POINTER, debug), {
    mnemonic: "MLOAD",
    opcode: 0x51,
  });
  // Stack: [new_fp, args...]

  // mem[FMP] = new_fp + frameSize
  s = emit(
    s,
    debug,
    { mnemonic: "DUP1", opcode: 0x80 },
    ...pushImm(frameSize, debug),
    { mnemonic: "ADD", opcode: 0x01 },
    ...pushImm(FREE_MEMORY_POINTER, debug),
    { mnemonic: "MSTORE", opcode: 0x52 },
  );

  // frame[SAVED_FP] = old FP
  // old_fp = mem[FRAME_POINTER]
  s = emit(
    s,
    debug,
    ...pushImm(FRAME_POINTER, debug),
    { mnemonic: "MLOAD", opcode: 0x51 },
    // Stack: [old_fp, new_fp, args...]
    { mnemonic: "DUP2", opcode: 0x81 },
    // Stack: [new_fp, old_fp, new_fp, args...]
    { mnemonic: "MSTORE", opcode: 0x52 },
    // MSTORE(offset=new_fp, value=old_fp)
    // → stores old_fp at new_fp+0 (SAVED_FP=0)
    // Stack: [new_fp, args...]
  );

  // mem[FRAME_POINTER] = new_fp
  s = emit(
    s,
    debug,
    { mnemonic: "DUP1", opcode: 0x80 },
    ...pushImm(FRAME_POINTER, debug),
    { mnemonic: "MSTORE", opcode: 0x52 },
  );

  // frame[SAVED_RETURN_PC] = mem[RETURN_PC_SCRATCH]
  s = emit(
    s,
    debug,
    ...pushImm(RETURN_PC_SCRATCH, debug),
    { mnemonic: "MLOAD", opcode: 0x51 },
    // Stack: [return_pc, new_fp, args...]
    { mnemonic: "DUP2", opcode: 0x81 },
    // Stack: [new_fp, return_pc, new_fp, args...]
    ...pushImm(SAVED_RETURN_PC, debug),
    { mnemonic: "ADD", opcode: 0x01 },
    // Stack: [new_fp+0x20, return_pc, new_fp, args...]
    { mnemonic: "MSTORE", opcode: 0x52 },
    // MSTORE(offset=new_fp+0x20, value=return_pc)
    // Stack: [new_fp, args...]
  );

  return s;
}

/**
 * Emit FP-relative MSTORE.
 *
 * Computes mem[FRAME_POINTER] + offset and stores the
 * current TOS value there. Consumes TOS.
 *
 * Stack effect: [value, ...] → [...]
 */
function emitFpRelativeStore<S extends Stack>(
  state: State<S>,
  offset: number,
  debug: Debug,
): State<S> {
  // Stack: [value, ...]
  // → PUSH FP; MLOAD; PUSH offset; ADD
  // Stack: [fp+offset, value, ...]
  // → MSTORE (offset=fp+offset, value=value)
  // Stack: [...]
  return emit(
    state,
    debug,
    ...pushImm(FRAME_POINTER, debug),
    { mnemonic: "MLOAD", opcode: 0x51 },
    ...pushImm(offset, debug),
    { mnemonic: "ADD", opcode: 0x01 },
    { mnemonic: "MSTORE", opcode: 0x52 },
  );
}

function makePrologueDebug(func: Ir.Function): Debug {
  return func.sourceId && func.loc
    ? {
        context: {
          gather: [
            { remark: "prologue: allocate call frame" },
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
          remark: "prologue: allocate call frame",
        } as Format.Program.Context,
      };
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
