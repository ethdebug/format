/**
 * Serialization module for converting Instructions to raw EVM bytecode
 */

import type * as Evm from "#evm";

/**
 * Convert an array of Instructions to raw bytecode bytes
 */
export function serialize(instructions: Evm.Instruction[]): number[] {
  const bytes: number[] = [];

  for (const instruction of instructions) {
    // Add the opcode
    bytes.push(instruction.opcode);

    // Add any immediates
    if (instruction.immediates) {
      bytes.push(...instruction.immediates);
    }
  }

  return bytes;
}

/**
 * Calculate the size in bytes that an instruction will occupy
 */
export function instructionSize(instruction: Evm.Instruction): number {
  let size = 1; // opcode

  if (instruction.immediates) {
    size += instruction.immediates.length;
  }

  return size;
}

/**
 * Calculate total size of multiple instructions
 */
export function calculateSize(instructions: Evm.Instruction[]): number {
  return instructions.reduce((acc, inst) => acc + instructionSize(inst), 0);
}
