import type * as Ir from "#ir";
import * as Evm from "#evm";
import type { Stack } from "#evm";
import { type Transition, operations, pipe } from "#evmgen/operations";

import { valueId, annotateTop } from "./identify.js";

/**
 * Load a value onto the stack
 */
export const loadValue = <S extends Stack>(
  value: Ir.Value,
  options?: Evm.InstructionOptions,
): Transition<S, readonly ["value", ...S]> => {
  const { PUSHn, DUPn, MLOAD } = operations;

  const id = valueId(value);

  if (value.kind === "const") {
    return pipe<S>()
      .then(PUSHn(BigInt(value.value), options))
      .then(annotateTop(id))
      .done();
  }

  return pipe<S>()
    .peek((state, builder) => {
      // Check if value is on stack
      // Note addition because DUP uses 1-based indexing
      const stackPos =
        state.stack.findIndex(({ irValue }) => irValue === id) + 1;
      if (stackPos > 0 && stackPos <= 16) {
        return builder.then(DUPn(stackPos, options), { as: "value" });
      }
      // Check if in memory
      if (id in state.memory.allocations) {
        const offset = state.memory.allocations[id].offset;
        return builder
          .then(PUSHn(BigInt(offset), options), { as: "offset" })
          .then(MLOAD(options))
          .then(annotateTop(id));
      }

      throw new Error(`Cannot load value ${id} - not in stack or memory`);
    })
    .done();
};
