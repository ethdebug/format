/**
 * IR instruction code generation - dispatcher
 */

import type * as Ir from "#ir";
import type { Stack } from "#evm";

import type { Transition } from "#evmgen/operations";

import {
  generateBinary,
  generateUnary,
  generateCast,
  generateConst,
  generateEnvOp,
  generateHashOp,
  generateLength,
  generateComputeSlot,
  generateRead,
  generateWrite,
  generateAllocate,
  generateComputeOffset,
} from "./instructions/index.js";

/**
 * Generate code for an IR instruction
 */
export function generate<S extends Stack>(
  inst: Ir.Instruction,
): Transition<S, Stack> {
  switch (inst.kind) {
    case "const":
      return generateConst(inst);
    case "binary":
      return generateBinary(inst);
    case "unary":
      return generateUnary(inst);
    case "read":
      return generateRead(inst);
    case "write":
      return generateWrite(inst);
    case "env":
      return generateEnvOp(inst);
    case "hash":
      return generateHashOp(inst);
    case "length":
      return generateLength(inst);
    case "compute_slot":
      return generateComputeSlot(inst);
    case "cast":
      return generateCast(inst);
    case "allocate":
      return generateAllocate(inst);
    case "compute_offset":
      return generateComputeOffset(inst);
    // Call instruction removed - calls are now block terminators
    default: {
      // This should be unreachable if all instruction types are handled
      const _: never = inst;
      return _ as never;
    }
  }
}
