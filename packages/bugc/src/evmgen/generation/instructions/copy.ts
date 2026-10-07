import type * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, pipe, operations } from "#evmgen/operations";

import { loadValue } from "../values/index.js";

const { MCOPY, CALLDATACOPY } = operations;

/**
 * Generate code for a copy to memory: MCOPY from memory, CALLDATACOPY
 * from calldata
 */
export function generateCopy<S extends Stack>(
  inst: Ir.Instruction.Copy,
): Transition<S, S> {
  const debug = inst.operationDebug;
  const copy = inst.location === "calldata" ? CALLDATACOPY : MCOPY;

  return pipe<S>()
    .then(loadValue(inst.length, { debug }), { as: "size" })
    .then(loadValue(inst.source, { debug }), { as: "offset" })
    .then(loadValue(inst.offset, { debug }), { as: "destOffset" })
    .then(copy({ debug }))
    .done();
}
