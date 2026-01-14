import * as Evm from "#evm";
import type { Stack } from "#evm";
import { type Transition, operations, pipe } from "#evmgen/operations";

import { annotateTop } from "./identify.js";

/**
 * Store a value to memory if it needs to be persisted
 */
export const storeValueIfNeeded = <S extends Stack>(
  destId: string,
  options?: Evm.InstructionOptions,
): Transition<readonly ["value", ...S], readonly ["value", ...S]> => {
  const { PUSHn, DUP2, SWAP1, MSTORE } = operations;

  return (
    pipe<readonly ["value", ...S]>()
      // First annotate the top value with the destination ID
      .then(annotateTop(destId))
      .peek((state, builder) => {
        const allocation = state.memory.allocations[destId];
        if (allocation === undefined) {
          return builder;
        }
        return builder
          .then(PUSHn(BigInt(allocation.offset), options), { as: "offset" })
          .then(DUP2(options))
          .then(SWAP1(options))
          .then(MSTORE(options));
      })
      .done()
  );
};
