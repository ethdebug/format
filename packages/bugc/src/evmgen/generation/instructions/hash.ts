import type * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, pipe, operations } from "#evmgen/operations";
import { Memory } from "#evmgen/analysis";

import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { PUSHn, MSTORE, MLOAD, ADD, KECCAK256 } = operations;

const freeMemoryPointer = BigInt(Memory.regions.FREE_MEMORY_POINTER);

/**
 * Generate code for hash operations: keccak256 of the values' 32-byte
 * words, in order. One or two words go in the scratch space at 0x00;
 * more go in the free memory, which they do not allocate.
 */
export function generateHashOp<S extends Stack>(
  inst: Ir.Instruction.Hash,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;
  const size = BigInt(inst.values.length * 32);

  if (inst.values.length <= 2) {
    const stores = inst.values.map((value, index) =>
      pipe<S>()
        .then(loadValue(value, { debug }))
        .then(PUSHn(BigInt(index * 32), { debug }), { as: "offset" })
        .then(MSTORE({ debug }))
        .done(),
    );
    return pipe<S>()
      .then(sequence(stores))
      .then(PUSHn(size, { debug }), { as: "size" })
      .then(PUSHn(0n, { debug }), { as: "offset" })
      .then(KECCAK256({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  const stores = inst.values.map((value, index) =>
    pipe<S>()
      .then(loadValue(value, { debug }))
      .then(PUSHn(BigInt(index * 32), { debug }), { as: "b" })
      .then(PUSHn(freeMemoryPointer, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "a" })
      .then(ADD({ debug }), { as: "offset" })
      .then(MSTORE({ debug }))
      .done(),
  );
  return pipe<S>()
    .then(sequence(stores))
    .then(PUSHn(size, { debug }), { as: "size" })
    .then(PUSHn(freeMemoryPointer, { debug }), { as: "offset" })
    .then(MLOAD({ debug }), { as: "offset" })
    .then(KECCAK256({ debug }), { as: "value" })
    .then(storeValueIfNeeded(inst.dest, { debug }))
    .done();
}

function sequence<S extends Stack>(
  steps: Transition<S, S>[],
): Transition<S, S> {
  return (state) => steps.reduce((current, step) => step(current), state);
}
