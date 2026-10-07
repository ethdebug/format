import * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, pipe, operations } from "#evmgen/operations";
import { Memory } from "#evmgen/analysis";

import { loadValue, storeValueIfNeeded, valueId } from "../values/index.js";

const { PUSHn, MSTORE, MLOAD, ADD, KECCAK256, CALLDATASIZE, CALLDATACOPY } =
  operations;

const freeMemoryPointer = BigInt(Memory.regions.FREE_MEMORY_POINTER);

/**
 * Generate code for hash operations.
 *
 * A word value (such as a `bytes32`) hashes its 32 bytes. Dynamic
 * `bytes` or a `string` in memory is the address of a length word,
 * followed by the data: hash the data. `msg.data` hashes the calldata.
 */
export function generateHashOp<S extends Stack>(
  inst: Ir.Instruction.Hash,
  msgDataIds: ReadonlySet<string> = new Set(),
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  // msg.data is a temp defined by an env `msg_data` instruction, so
  // the caller passes the ids of those temps. Copy the calldata to the
  // free memory, without allocating it, and hash it there.
  if (msgDataIds.has(valueId(inst.value))) {
    return pipe<S>()
      .then(CALLDATASIZE({ debug }), { as: "size" })
      .then(PUSHn(0n, { debug }), { as: "offset" })
      .then(PUSHn(freeMemoryPointer, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "destOffset" })
      .then(CALLDATACOPY({ debug }))
      .then(CALLDATASIZE({ debug }), { as: "size" })
      .then(PUSHn(freeMemoryPointer, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "offset" })
      .then(KECCAK256({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  if (Ir.Type.isRef(inst.value.type) && inst.value.type.location === "memory") {
    return pipe<S>()
      .then(loadValue(inst.value, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "size" })
      .then(PUSHn(32n, { debug }), { as: "b" })
      .then(loadValue(inst.value, { debug }), { as: "a" })
      .then(ADD({ debug }), { as: "offset" })
      .then(KECCAK256({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  return pipe<S>()
    .then(loadValue(inst.value, { debug }))
    .then(PUSHn(0n, { debug }), { as: "offset" })
    .then(MSTORE({ debug }))
    .then(PUSHn(32n, { debug }), { as: "size" })
    .then(PUSHn(0n, { debug }), { as: "offset" })
    .then(KECCAK256({ debug }), { as: "value" })
    .then(storeValueIfNeeded(inst.dest, { debug }))
    .done();
}
