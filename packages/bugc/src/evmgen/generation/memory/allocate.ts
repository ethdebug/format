import * as Evm from "#evm";
import type { Stack } from "#evm";
import { type Transition, operations, pipe } from "#evmgen/operations";
import { Memory } from "#evmgen/analysis";

/**
 * Allocate memory dynamically at runtime
 * Loads the free memory pointer, returns it, and updates it
 *
 * Stack: [...] -> [allocatedOffset, ...]
 *
 * Note: This is a simplified version. A proper implementation would
 * need to handle stack types more carefully.
 */
export function allocateMemory<S extends Stack>(
  sizeBytes: bigint,
  options?: Evm.InstructionOptions,
): Transition<S, readonly ["offset", ...S]> {
  const { PUSHn } = operations;

  return pipe<S>()
    .then(PUSHn(sizeBytes, options), { as: "size" })
    .then(allocateMemoryDynamic(options))
    .done();
}

/**
 * Allocate memory dynamically (runtime-determined size)
 * Takes size from stack, returns offset
 */
export function allocateMemoryDynamic<S extends Stack>(
  options?: Evm.InstructionOptions,
): Transition<readonly ["size", ...S], readonly ["offset", ...S]> {
  const { PUSHn, SWAP1, DUP2, MLOAD, ADD, MSTORE } = operations;

  return (
    pipe<readonly ["size", ...S]>()
      // Load current free memory pointer from 0x40
      .then(PUSHn(BigInt(Memory.regions.FREE_MEMORY_POINTER), options), {
        as: "offset",
      })
      .then(MLOAD(options), { as: "offset" })
      .then(SWAP1(options), { as: "b" })
      // Stack: [size, current_fmp, ...]
      // Save current for return, calculate new = current + size
      .then(DUP2(options), { as: "a" })
      // Stack: [current_fmp, size, current_fmp, ...]
      .then(ADD(options), { as: "value" })
      // Stack: [new_fmp, current_fmp, ...]

      // Store new free pointer
      .then(PUSHn(BigInt(Memory.regions.FREE_MEMORY_POINTER), options), {
        as: "offset",
      })
      .then(MSTORE(options))
      // Stack: [current_fmp(allocated), ...]
      .done()
  );
}
