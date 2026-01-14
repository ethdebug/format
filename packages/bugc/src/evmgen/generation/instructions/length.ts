import * as Ir from "#ir";
import type { Stack } from "#evm";

import { Error, ErrorCode } from "#evmgen/errors";
import { type Transition, pipe, operations } from "#evmgen/operations";

import { loadValue, storeValueIfNeeded, valueId } from "../values/index.js";

const { PUSHn, CALLDATASIZE, SLOAD, MLOAD, SUB, SHR } = operations;

/**
 * Generate code for length operations
 */
export function generateLength<S extends Stack>(
  inst: Ir.Instruction.Length,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  // Check if this is msg.data (calldata) - use CALLDATASIZE
  const objectId = valueId(inst.object);
  const isCalldata =
    objectId.includes("calldata") ||
    objectId.includes("msg_data") ||
    objectId.includes("msg.data");

  if (isCalldata) {
    return pipe<S>()
      .then(CALLDATASIZE({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Length instruction - with the new type system, we need to handle references
  const objectType = inst.object.type;

  // For references, we need to check the origin type to understand the data structure
  if (objectType.kind === "ref") {
    // Check if this is a dynamic array or string in memory
    return pipe<S>()
      .peek((state, builder) => {
        // Check if value is in memory
        const isInMemory =
          objectId in state.memory.allocations ||
          state.stack.findIndex(({ irValue }) => irValue === objectId) > -1;

        if (isInMemory || objectType.location === "memory") {
          // Memory data: length is stored at the pointer location
          // First word contains length
          return builder
            .then(loadValue(inst.object, { debug }), { as: "offset" })
            .then(MLOAD({ debug }), { as: "value" })
            .then(storeValueIfNeeded(inst.dest, { debug }));
        } else {
          // Storage data: length is packed with data if short, or in slot if long
          // For simplicity, assume it's stored at the slot (long string/bytes)
          // The length is stored as 2 * length + 1 in the slot for long strings
          return (
            builder
              .then(loadValue(inst.object, { debug }), { as: "key" })
              .then(SLOAD({ debug }), { as: "b" })
              // Extract length from storage format
              // For long strings: (value - 1) / 2
              .then(PUSHn(1n, { debug }), { as: "a" })
              .then(SUB({ debug }), { as: "value" })
              .then(PUSHn(1n, { debug }), { as: "shift" })
              .then(SHR({ debug }), { as: "value" })
              .then(storeValueIfNeeded(inst.dest, { debug }))
          );
        }
      })
      .done();
  }

  // For scalars, we might have fixed-size data
  if (objectType.kind === "scalar") {
    // Fixed-size data - this shouldn't normally happen for length instruction
    // but we could return the size in bytes
    return pipe<S>()
      .then(PUSHn(BigInt(objectType.size), { debug }))
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // This should never happen as we've covered all type kinds
  // But TypeScript doesn't know that, so we need to handle it
  throw new Error(
    ErrorCode.UNSUPPORTED_INSTRUCTION,
    `length operation not supported for type`,
  );
}
