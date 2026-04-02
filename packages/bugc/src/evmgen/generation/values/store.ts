import * as Evm from "#evm";
import type { Stack } from "#evm";
import { type Transition, operations, pipe } from "#evmgen/operations";
import { Memory } from "#evmgen/analysis";

import { annotateTop } from "./identify.js";

/**
 * Store a value to memory if it needs to be persisted.
 *
 * When the function uses call frames (memory.frameSize is
 * set), the store address is FP-relative: load frame base
 * from FRAME_POINTER, add the allocation offset, then
 * MSTORE.
 */
export const storeValueIfNeeded = <S extends Stack>(
  destId: string,
  options?: Evm.InstructionOptions,
): Transition<readonly ["value", ...S], readonly ["value", ...S]> => {
  const { PUSHn, ADD, DUP2, SWAP1, MLOAD, MSTORE } = operations;

  return (
    pipe<readonly ["value", ...S]>()
      // First annotate the top value with the destination ID
      .then(annotateTop(destId))
      .peek((state, builder) => {
        const allocation = state.memory.allocations[destId];
        if (allocation === undefined) {
          return builder;
        }
        if (state.memory.frameSize !== undefined) {
          // FP-relative store:
          // stack: [value, ...]
          // → PUSH FP_SLOT / MLOAD / PUSH offset / ADD
          //   → [addr, value, ...]
          // → DUP2 / SWAP1 / MSTORE
          //   → [value, ...]
          return builder
            .then(PUSHn(BigInt(Memory.regions.FRAME_POINTER), options), {
              as: "offset",
            })
            .then(MLOAD(options), { as: "b" })
            .then(PUSHn(BigInt(allocation.offset), options), {
              as: "a",
            })
            .then(ADD(options), { as: "offset" })
            .then(DUP2(options))
            .then(SWAP1(options))
            .then(MSTORE(options));
        }
        return builder
          .then(PUSHn(BigInt(allocation.offset), options), {
            as: "offset",
          })
          .then(DUP2(options))
          .then(SWAP1(options))
          .then(MSTORE(options));
      })
      .done()
  );
};
