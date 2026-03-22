/**
 * Complete EVM instruction set definitions with type-safe stack operations.
 *
 * This file provides factory functions for all EVM instructions, mapping each
 * opcode to a type-safe operation that correctly handles stack manipulation.
 * Instructions are organized by functionality and include:
 *
 * - Arithmetic operations (ADD, MUL, SUB, etc.)
 * - Comparison operations (LT, GT, EQ, etc.)
 * - Bitwise operations (AND, OR, XOR, etc.)
 * - Stack operations (POP, PUSH*, DUP*, SWAP*)
 * - Memory/Storage operations (MLOAD, SLOAD, etc.)
 * - Environment/blockchain data access
 * - Control flow operations (JUMP, JUMPI, etc.)
 * - System operations (CALL, CREATE, etc.)
 *
 * Each instruction is defined with precise stack consumption/production patterns
 * using semantic stack brands for type safety.
 */

import type { $ } from "./hkts.js";

import { type Stack } from "./stack.js";

import { type InstructionOptions, type State, Specifiers } from "./state.js";

export type Operations<U, I> = ReturnType<typeof makeOperations<U, I>>;

/**
 * Creates a complete set of type-safe EVM operations from unsafe state controls.
 * Returns an object mapping instruction mnemonics to their operation functions.
 */
export const makeOperations = <U, I>(controls: State.Controls<U, I>) => {
  const {
    mapInstruction,
    makeOperationForInstruction,
    makeOperationWithImmediatesForInstruction,
  } = Specifiers.makeUsing(controls);

  return {
    /*
     * ============================================
     * 0x00: Stop and Control Flow
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x00, mnemonic: "STOP" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x01-0x07: Arithmetic Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x01, mnemonic: "ADD" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a + b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x02, mnemonic: "MUL" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a * b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x03, mnemonic: "SUB" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a - b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x04, mnemonic: "DIV" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a // b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x05, mnemonic: "SDIV" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a // b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x06, mnemonic: "MOD" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a % b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x07, mnemonic: "SMOD" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a % b"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x08-0x09: Modular Arithmetic
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x08, mnemonic: "ADDMOD" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b", "N"] as const,
        produces: ["(a + b) % N"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x09, mnemonic: "MULMOD" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b", "N"] as const,
        produces: ["(a * b) % N"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x0a: Exponentiation
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x0a, mnemonic: "EXP" } as const,
      makeOperationForInstruction({
        consumes: ["a", "exponent"] as const,
        produces: ["a ** exponent"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x0b: Sign Extension
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x0b, mnemonic: "SIGNEXTEND" } as const,
      makeOperationForInstruction({
        consumes: ["b", "x"] as const,
        produces: ["y"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x0c-0x0f: Undefined opcodes
     * ============================================
     * { opcode: 0x0c, mnemonic: "???" }
     * { opcode: 0x0d, mnemonic: "???" }
     * { opcode: 0x0e, mnemonic: "???" }
     * { opcode: 0x0f, mnemonic: "???" }
     */

    /*
     * ============================================
     * 0x10-0x14: Comparison Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x10, mnemonic: "LT" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a < b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x11, mnemonic: "GT" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a > b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x12, mnemonic: "SLT" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a < b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x13, mnemonic: "SGT" },
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a > b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x14, mnemonic: "EQ" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a == b"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x15: Zero Check
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x15, mnemonic: "ISZERO" } as const,
      makeOperationForInstruction({
        consumes: ["a"] as const,
        produces: ["a == 0"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x16-0x18: Bitwise Logic Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x16, mnemonic: "AND" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a & b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x17, mnemonic: "OR" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a | b"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x18, mnemonic: "XOR" } as const,
      makeOperationForInstruction({
        consumes: ["a", "b"] as const,
        produces: ["a ^ b"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x19: Bitwise NOT
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x19, mnemonic: "NOT" } as const,
      makeOperationForInstruction({
        consumes: ["a"] as const,
        produces: ["~a"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x1a: Byte Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x1a, mnemonic: "BYTE" } as const,
      makeOperationForInstruction({
        consumes: ["i", "x"] as const,
        produces: ["y"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x1b-0x1d: Shift Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x1b, mnemonic: "SHL" } as const,
      makeOperationForInstruction({
        consumes: ["shift", "value"] as const,
        produces: ["value << shift"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x1c, mnemonic: "SHR" } as const,
      makeOperationForInstruction({
        consumes: ["shift", "value"] as const,
        produces: ["value >> shift"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x1d, mnemonic: "SAR" } as const,
      makeOperationForInstruction({
        consumes: ["shift", "value"] as const,
        produces: ["value >> shift"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x1e-0x1f: Undefined opcodes
     * ============================================
     * { opcode: 0x1e, mnemonic: "???" }
     * { opcode: 0x1f, mnemonic: "???" }
     */

    /*
     * ============================================
     * 0x20: Keccak256 Hash
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x20, mnemonic: "KECCAK256" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size"] as const,
        produces: ["hash"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x21-0x2f: Undefined opcodes
     * ============================================
     * { opcode: 0x21, mnemonic: "???" }
     * { opcode: 0x22, mnemonic: "???" }
     * { opcode: 0x23, mnemonic: "???" }
     * { opcode: 0x24, mnemonic: "???" }
     * { opcode: 0x25, mnemonic: "???" }
     * { opcode: 0x26, mnemonic: "???" }
     * { opcode: 0x27, mnemonic: "???" }
     * { opcode: 0x28, mnemonic: "???" }
     * { opcode: 0x29, mnemonic: "???" }
     * { opcode: 0x2a, mnemonic: "???" }
     * { opcode: 0x2b, mnemonic: "???" }
     * { opcode: 0x2c, mnemonic: "???" }
     * { opcode: 0x2d, mnemonic: "???" }
     * { opcode: 0x2e, mnemonic: "???" }
     * { opcode: 0x2f, mnemonic: "???" }
     */

    /*
     * ============================================
     * 0x30-0x34: Environment Information
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x30, mnemonic: "ADDRESS" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["address"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x31, mnemonic: "BALANCE" } as const,
      makeOperationForInstruction({
        consumes: ["address"] as const,
        produces: ["balance"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x32, mnemonic: "ORIGIN" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["address"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x33, mnemonic: "CALLER" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["address"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x34, mnemonic: "CALLVALUE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x35-0x39: Input Data Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x35, mnemonic: "CALLDATALOAD" } as const,
      makeOperationForInstruction({
        consumes: ["i"] as const,
        produces: ["data[i]"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x36, mnemonic: "CALLDATASIZE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["size"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x37, mnemonic: "CALLDATACOPY" } as const,
      makeOperationForInstruction({
        consumes: ["destOffset", "offset", "size"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x38, mnemonic: "CODESIZE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["size"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x39, mnemonic: "CODECOPY" } as const,
      makeOperationForInstruction({
        consumes: ["destOffset", "offset", "size"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x3a-0x3f: External Information
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x3a, mnemonic: "GASPRICE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["price"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x3b, mnemonic: "EXTCODESIZE" } as const,
      makeOperationForInstruction({
        consumes: ["address"] as const,
        produces: ["size"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x3c, mnemonic: "EXTCODECOPY" } as const,
      makeOperationForInstruction({
        consumes: ["address", "destOffset", "offset", "size"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x3d, mnemonic: "RETURNDATASIZE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["size"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x3e, mnemonic: "RETURNDATACOPY" } as const,
      makeOperationForInstruction({
        consumes: ["destOffset", "offset", "size"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x3f, mnemonic: "EXTCODEHASH" } as const,
      makeOperationForInstruction({
        consumes: ["address"] as const,
        produces: ["hash"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x40-0x49: Block Information
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x40, mnemonic: "BLOCKHASH" } as const,
      makeOperationForInstruction({
        consumes: ["blockNumber"] as const,
        produces: ["hash"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x41, mnemonic: "COINBASE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["address"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x42, mnemonic: "TIMESTAMP" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["timestamp"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x43, mnemonic: "NUMBER" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["blockNumber"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x44, mnemonic: "PREVRANDAO" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["difficulty"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x45, mnemonic: "GASLIMIT" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["gasLimit"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x46, mnemonic: "CHAINID" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["chainId"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x47, mnemonic: "SELFBALANCE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["balance"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x48, mnemonic: "BASEFEE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["baseFee"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x49, mnemonic: "BLOBHASH" } as const,
      makeOperationForInstruction({
        consumes: ["index"] as const,
        produces: ["blobVersionedHashesAtIndex"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x4a: Blob Base Fee
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x4a, mnemonic: "BLOBBASEFEE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["blobBaseFee"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x4b-0x4f: Undefined opcodes
     * ============================================
     * { opcode: 0x4b, mnemonic: "???" }
     * { opcode: 0x4c, mnemonic: "???" }
     * { opcode: 0x4d, mnemonic: "???" }
     * { opcode: 0x4e, mnemonic: "???" }
     * { opcode: 0x4f, mnemonic: "???" }
     */

    /*
     * ============================================
     * 0x50: Stack Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x50, mnemonic: "POP" } as const,
      makeOperationForInstruction({
        consumes: ["y"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x51-0x53: Memory Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x51, mnemonic: "MLOAD" } as const,
      makeOperationForInstruction({
        consumes: ["offset"] as const,
        produces: ["value"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x52, mnemonic: "MSTORE" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "value"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x53, mnemonic: "MSTORE8" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "value"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x54-0x55: Storage Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x54, mnemonic: "SLOAD" } as const,
      makeOperationForInstruction({
        consumes: ["key"] as const,
        produces: ["value"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x55, mnemonic: "SSTORE" } as const,
      makeOperationForInstruction({
        consumes: ["key", "value"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x56-0x5b: Flow Operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x56, mnemonic: "JUMP" } as const,
      makeOperationForInstruction({
        consumes: ["counter"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x57, mnemonic: "JUMPI" } as const,
      makeOperationForInstruction({
        consumes: ["counter", "b"] as const,
        produces: [] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x58, mnemonic: "PC" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["counter"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x59, mnemonic: "MSIZE" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["size"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x5a, mnemonic: "GAS" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["gas"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x5b, mnemonic: "JUMPDEST" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x5c-0x5d: Transient Storage
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x5c, mnemonic: "TLOAD" } as const,
      makeOperationForInstruction({
        consumes: ["key"] as const,
        produces: ["value"] as const,
      }),
    ),

    ...mapInstruction(
      { opcode: 0x5d, mnemonic: "TSTORE" } as const,
      makeOperationForInstruction({
        consumes: ["key", "value"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x5e: Memory Copy
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x5e, mnemonic: "MCOPY" } as const,
      makeOperationForInstruction({
        consumes: ["destOffset", "offset", "size"] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0x5f: PUSH0
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x5f, mnemonic: "PUSH0" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x60-0x7f: PUSH1 through PUSH32
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x60, mnemonic: "PUSH1" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x61, mnemonic: "PUSH2" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x62, mnemonic: "PUSH3" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x63, mnemonic: "PUSH4" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x64, mnemonic: "PUSH5" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x65, mnemonic: "PUSH6" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x66, mnemonic: "PUSH7" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x67, mnemonic: "PUSH8" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x68, mnemonic: "PUSH9" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x69, mnemonic: "PUSH10" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6a, mnemonic: "PUSH11" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6b, mnemonic: "PUSH12" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6c, mnemonic: "PUSH13" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6d, mnemonic: "PUSH14" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6e, mnemonic: "PUSH15" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x6f, mnemonic: "PUSH16" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x70, mnemonic: "PUSH17" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x71, mnemonic: "PUSH18" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x72, mnemonic: "PUSH19" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x73, mnemonic: "PUSH20" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x74, mnemonic: "PUSH21" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x75, mnemonic: "PUSH22" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x76, mnemonic: "PUSH23" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x77, mnemonic: "PUSH24" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x78, mnemonic: "PUSH25" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x79, mnemonic: "PUSH26" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7a, mnemonic: "PUSH27" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7b, mnemonic: "PUSH28" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7c, mnemonic: "PUSH29" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7d, mnemonic: "PUSH30" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7e, mnemonic: "PUSH31" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0x7f, mnemonic: "PUSH32" } as const,
      makeOperationWithImmediatesForInstruction({
        consumes: [] as const,
        produces: ["value"] as const,
      }),
    ),

    /*
     * ============================================
     * 0x80-0x8f: DUP operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x80, mnemonic: "DUP1" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <A extends Stack.Brand, S extends Stack>(
          initialState: $<U, [readonly [A, ...S]]>,
        ): $<U, [readonly [A, A, ...S]]> => {
          // DUP1 duplicates the top stack item
          // Stack: [value, ...] -> [value, value, ...]
          const [a] = controls.topN(initialState, 1);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(a, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x81, mnemonic: "DUP2" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <A extends Stack.Brand, B extends Stack.Brand, S extends Stack>(
          initialState: $<U, [readonly [A, B, ...S]]>,
        ): $<U, [readonly [B, A, B, ...S]]> => {
          const [_a, b] = controls.topN(initialState, 2);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(b, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x82, mnemonic: "DUP3" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, ...S]]>,
        ): $<U, [readonly [C, A, B, C, ...S]]> => {
          const [_a, _b, c] = controls.topN(initialState, 3);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(c, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x83, mnemonic: "DUP4" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, ...S]]>,
        ): $<U, [readonly [D, A, B, C, D, ...S]]> => {
          const [_a, _b, _c, d] = controls.topN(initialState, 4);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(d, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x84, mnemonic: "DUP5" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, ...S]]>,
        ): $<U, [readonly [E, A, B, C, D, E, ...S]]> => {
          const [_a, _b, _c, _d, e] = controls.topN(initialState, 5);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(e, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x85, mnemonic: "DUP6" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, ...S]]>,
        ): $<U, [readonly [F, A, B, C, D, E, F, ...S]]> => {
          const [_a, _b, _c, _d, _e, f] = controls.topN(initialState, 6);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(f, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x86, mnemonic: "DUP7" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, ...S]]>,
        ): $<U, [readonly [G, A, B, C, D, E, F, G, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, g] = controls.topN(initialState, 7);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(g, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x87, mnemonic: "DUP8" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, ...S]]>,
        ): $<U, [readonly [H, A, B, C, D, E, F, G, H, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, _g, h] = controls.topN(
            initialState,
            8,
          );
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(h, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x88, mnemonic: "DUP9" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, I, ...S]]>,
        ): $<U, [readonly [I, A, B, C, D, E, F, G, H, I, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, i] = controls.topN(
            initialState,
            9,
          );
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(i, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x89, mnemonic: "DUP10" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, I, J, ...S]]>,
        ): $<U, [readonly [J, A, B, C, D, E, F, G, H, I, J, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, j] = controls.topN(
            initialState,
            10,
          );
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(j, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8a, mnemonic: "DUP11" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, ...S]]
          >,
        ): $<U, [readonly [K, A, B, C, D, E, F, G, H, I, J, K, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, k] = controls.topN(
            initialState,
            11,
          );
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(k, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8b, mnemonic: "DUP12" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, ...S]]
          >,
        ): $<U, [readonly [L, A, B, C, D, E, F, G, H, I, J, K, L, ...S]]> => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, l] = controls.topN(
            initialState,
            12,
          );
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(l, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8c, mnemonic: "DUP13" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, ...S]]
          >,
        ): $<
          U,
          [readonly [M, A, B, C, D, E, F, G, H, I, J, K, L, M, ...S]]
        > => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, m] =
            controls.topN(initialState, 13);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(m, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8d, mnemonic: "DUP14" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, ...S]]
          >,
        ): $<
          U,
          [readonly [N, A, B, C, D, E, F, G, H, I, J, K, L, M, N, ...S]]
        > => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, n] =
            controls.topN(initialState, 14);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(n, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8e, mnemonic: "DUP15" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          O extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, ...S]]
          >,
        ): $<
          U,
          [readonly [O, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, ...S]]
        > => {
          const [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, o] =
            controls.topN(initialState, 15);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(o, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    ...mapInstruction(
      { opcode: 0x8f, mnemonic: "DUP16" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          O extends Stack.Brand,
          P extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, ...S]]
          >,
        ): $<
          U,
          [readonly [P, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, ...S]]
        > => {
          const [
            _a,
            _b,
            _c,
            _d,
            _e,
            _f,
            _g,
            _h,
            _i,
            _j,
            _k,
            _l,
            _m,
            _n,
            _o,
            p,
          ] = controls.topN(initialState, 16);
          const { id, state } = controls.generateId(initialState, "dup");
          const stateWithPush = controls.push(state, controls.duplicate(p, id));
          return controls.emit(stateWithPush, { ...instruction, ...options });
        },
    ),

    /*
     * ============================================
     * 0x90-0x9f: SWAP operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0x90, mnemonic: "SWAP1" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <A extends Stack.Brand, B extends Stack.Brand, S extends Stack>(
          initialState: $<U, [readonly [A, B, ...S]]>,
        ): $<U, [readonly [B, A, ...S]]> => {
          // SWAP1 exchanges 1st and 2nd stack items
          // Get the top 2 items with their IDs and brands
          const [a, b] = controls.topN(initialState, 2);

          // Pop the top 2 items
          let state = controls.popN(initialState, 2);

          // Push them back in swapped order
          // Original order was [A, B], we want [B, A]
          // Push A first (items[0]), then B (items[1]) to get B on top
          state = controls.push(state, a);
          state = controls.push(state, b);

          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x91, mnemonic: "SWAP2" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, ...S]]>,
        ): $<U, [readonly [C, B, A, ...S]]> => {
          // SWAP2 exchanges 1st and 3rd stack items
          const [a, b, c] = controls.topN(initialState, 3);

          let state = controls.popN(initialState, 3);

          // Push in order to get [C, B, A] on stack
          state = controls.push(state, a);
          state = controls.push(state, b);
          state = controls.push(state, c);

          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x92, mnemonic: "SWAP3" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, ...S]]>,
        ): $<U, [readonly [D, B, C, A, ...S]]> => {
          // SWAP3 exchanges 1st and 4th stack items
          const [a, b, c, d] = controls.topN(initialState, 4);

          let state = controls.popN(initialState, 4);

          // Push in order to get [D, B, C, A] on stack
          state = controls.push(state, a);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, d);

          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x93, mnemonic: "SWAP4" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, ...S]]>,
        ): $<U, [readonly [E, B, C, D, A, ...S]]> => {
          // SWAP4 exchanges 1st and 5th stack items
          const [a, b, c, d, e] = controls.topN(initialState, 5);

          let state = controls.popN(initialState, 5);

          // Push in order to get [E, B, C, D, A] on stack
          state = controls.push(state, a);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, e);

          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x94, mnemonic: "SWAP5" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, ...S]]>,
        ): $<U, [readonly [F, B, C, D, E, A, ...S]]> => {
          const [a, b, c, d, e, f] = controls.topN(initialState, 6);
          let state = controls.popN(initialState, 6);
          state = controls.push(state, a);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, f);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x95, mnemonic: "SWAP6" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, ...S]]>,
        ): $<U, [readonly [G, B, C, D, E, F, A, ...S]]> => {
          const [a, b, c, d, e, f, g] = controls.topN(initialState, 7);
          let state = controls.popN(initialState, 7);
          state = controls.push(state, a);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, g);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x96, mnemonic: "SWAP7" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, ...S]]>,
        ): $<U, [readonly [H, B, C, D, E, F, G, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h] = controls.topN(initialState, 8);
          let state = controls.popN(initialState, 8);
          state = controls.push(state, a);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, h);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x97, mnemonic: "SWAP8" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, I, ...S]]>,
        ): $<U, [readonly [I, B, C, D, E, F, G, H, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h, i] = controls.topN(initialState, 9);
          let state = controls.popN(initialState, 9);
          state = controls.push(state, a);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, i);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x98, mnemonic: "SWAP9" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<U, [readonly [A, B, C, D, E, F, G, H, I, J, ...S]]>,
        ): $<U, [readonly [J, B, C, D, E, F, G, H, I, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h, i, j] = controls.topN(
            initialState,
            10,
          );
          let state = controls.popN(initialState, 10);
          state = controls.push(state, a);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, j);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x99, mnemonic: "SWAP10" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, ...S]]
          >,
        ): $<U, [readonly [K, B, C, D, E, F, G, H, I, J, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h, i, j, k] = controls.topN(
            initialState,
            11,
          );
          let state = controls.popN(initialState, 11);
          state = controls.push(state, a);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, k);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9a, mnemonic: "SWAP11" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, ...S]]
          >,
        ): $<U, [readonly [L, B, C, D, E, F, G, H, I, J, K, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h, i, j, k, l] = controls.topN(
            initialState,
            12,
          );
          let state = controls.popN(initialState, 12);
          state = controls.push(state, a);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, l);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9b, mnemonic: "SWAP12" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, ...S]]
          >,
        ): $<U, [readonly [M, B, C, D, E, F, G, H, I, J, K, L, A, ...S]]> => {
          const [a, b, c, d, e, f, g, h, i, j, k, l, m] = controls.topN(
            initialState,
            13,
          );
          let state = controls.popN(initialState, 13);
          state = controls.push(state, a);
          state = controls.push(state, l);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, m);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9c, mnemonic: "SWAP13" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, ...S]]
          >,
        ): $<
          U,
          [readonly [N, B, C, D, E, F, G, H, I, J, K, L, M, A, ...S]]
        > => {
          const [a, b, c, d, e, f, g, h, i, j, k, l, m, n] = controls.topN(
            initialState,
            14,
          );
          let state = controls.popN(initialState, 14);
          state = controls.push(state, a);
          state = controls.push(state, m);
          state = controls.push(state, l);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, n);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9d, mnemonic: "SWAP14" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          O extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, ...S]]
          >,
        ): $<
          U,
          [readonly [O, B, C, D, E, F, G, H, I, J, K, L, M, N, A, ...S]]
        > => {
          const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o] = controls.topN(
            initialState,
            15,
          );
          let state = controls.popN(initialState, 15);
          state = controls.push(state, a);
          state = controls.push(state, n);
          state = controls.push(state, m);
          state = controls.push(state, l);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, o);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9e, mnemonic: "SWAP15" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          O extends Stack.Brand,
          P extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, ...S]]
          >,
        ): $<
          U,
          [readonly [P, B, C, D, E, F, G, H, I, J, K, L, M, N, O, A, ...S]]
        > => {
          const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p] =
            controls.topN(initialState, 16);
          let state = controls.popN(initialState, 16);
          state = controls.push(state, a);
          state = controls.push(state, o);
          state = controls.push(state, n);
          state = controls.push(state, m);
          state = controls.push(state, l);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, p);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),
    ...mapInstruction(
      { opcode: 0x9f, mnemonic: "SWAP16" } as const,
      (instruction) =>
        (options?: InstructionOptions) =>
        <
          A extends Stack.Brand,
          B extends Stack.Brand,
          C extends Stack.Brand,
          D extends Stack.Brand,
          E extends Stack.Brand,
          F extends Stack.Brand,
          G extends Stack.Brand,
          H extends Stack.Brand,
          I extends Stack.Brand,
          J extends Stack.Brand,
          K extends Stack.Brand,
          L extends Stack.Brand,
          M extends Stack.Brand,
          N extends Stack.Brand,
          O extends Stack.Brand,
          P extends Stack.Brand,
          Q extends Stack.Brand,
          S extends Stack,
        >(
          initialState: $<
            U,
            [readonly [A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, ...S]]
          >,
        ): $<
          U,
          [readonly [Q, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, A, ...S]]
        > => {
          const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q] =
            controls.topN(initialState, 17);
          let state = controls.popN(initialState, 17);
          state = controls.push(state, a);
          state = controls.push(state, p);
          state = controls.push(state, o);
          state = controls.push(state, n);
          state = controls.push(state, m);
          state = controls.push(state, l);
          state = controls.push(state, k);
          state = controls.push(state, j);
          state = controls.push(state, i);
          state = controls.push(state, h);
          state = controls.push(state, g);
          state = controls.push(state, f);
          state = controls.push(state, e);
          state = controls.push(state, d);
          state = controls.push(state, c);
          state = controls.push(state, b);
          state = controls.push(state, q);
          return controls.emit(state, { ...instruction, ...options });
        },
    ),

    /*
     * ============================================
     * 0xa0-0xa4: LOG operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0xa0, mnemonic: "LOG0" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xa1, mnemonic: "LOG1" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size", "topic"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xa2, mnemonic: "LOG2" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size", "topic1", "topic2"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xa3, mnemonic: "LOG3" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size", "topic1", "topic2", "topic3"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xa4, mnemonic: "LOG4" } as const,
      makeOperationForInstruction({
        consumes: [
          "offset",
          "size",
          "topic1",
          "topic2",
          "topic3",
          "topic4",
        ] as const,
        produces: [] as const,
      }),
    ),

    /*
     * ============================================
     * 0xf0-0xff: System operations
     * ============================================
     */
    ...mapInstruction(
      { opcode: 0xf0, mnemonic: "CREATE" } as const,
      makeOperationForInstruction({
        consumes: ["value", "offset", "size"] as const,
        produces: ["address"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xf1, mnemonic: "CALL" } as const,
      makeOperationForInstruction({
        consumes: [
          "gas",
          "address",
          "value",
          "argsOffset",
          "argsSize",
          "retOffset",
          "retSize",
        ] as const,
        produces: ["success"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xf2, mnemonic: "CALLCODE" } as const,
      makeOperationForInstruction({
        consumes: [
          "gas",
          "address",
          "value",
          "argsOffset",
          "argsSize",
          "retOffset",
          "retSize",
        ] as const,
        produces: ["success"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xf3, mnemonic: "RETURN" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xf4, mnemonic: "DELEGATECALL" } as const,
      makeOperationForInstruction({
        consumes: [
          "gas",
          "address",
          "argsOffset",
          "argsSize",
          "retOffset",
          "retSize",
        ] as const,
        produces: ["success"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xf5, mnemonic: "CREATE2" } as const,
      makeOperationForInstruction({
        consumes: ["value", "offset", "size", "salt"] as const,
        produces: ["address"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xfa, mnemonic: "STATICCALL" } as const,
      makeOperationForInstruction({
        consumes: [
          "gas",
          "address",
          "argsOffset",
          "argsSize",
          "retOffset",
          "retSize",
        ] as const,
        produces: ["success"] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xfd, mnemonic: "REVERT" } as const,
      makeOperationForInstruction({
        consumes: ["offset", "size"] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xfe, mnemonic: "INVALID" } as const,
      makeOperationForInstruction({
        consumes: [] as const,
        produces: [] as const,
      }),
    ),
    ...mapInstruction(
      { opcode: 0xff, mnemonic: "SELFDESTRUCT" } as const,
      makeOperationForInstruction({
        consumes: ["address"] as const,
        produces: [] as const,
      }),
    ),
  } as const;
};
