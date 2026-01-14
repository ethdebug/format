import type * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, pipe, operations } from "#evmgen/operations";

import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { PUSHn, MSTORE, KECCAK256 } = operations;

/**
 * Generate code for hash operations
 */
export function generateHashOp<S extends Stack>(
  inst: Ir.Instruction.Hash,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

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
