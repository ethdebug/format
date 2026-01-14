/**
 * Allocate instruction code generation
 */

import type * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, pipe } from "#evmgen/operations";
import { allocateMemoryDynamic } from "../memory/index.js";
import { loadValue, storeValueIfNeeded } from "../values/index.js";

/**
 * Generate code for allocate instructions
 * Loads the size value onto the stack, then allocates memory
 */
export function generateAllocate<S extends Stack>(
  inst: Ir.Instruction.Allocate,
): Transition<S, Stack> {
  const debug = inst.operationDebug;

  return (
    pipe<S>()
      // Load the size value onto the stack
      .then(loadValue(inst.size, { debug }), { as: "size" })
      // Allocate memory using the dynamic allocator
      .then(allocateMemoryDynamic({ debug }), { as: "value" })
      // Store the result if needed
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done()
  );
}
