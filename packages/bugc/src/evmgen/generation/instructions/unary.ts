import type * as Ir from "#ir";
import type { Stack } from "#evm";

import type { State } from "#evmgen/state";
import {
  type Transition,
  pipe,
  operations,
  rebrandTop,
} from "#evmgen/operations";
import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { ISZERO, PUSHn, SUB } = operations;

/**
 * Generate code for unary operations
 */
export function generateUnary<S extends Stack>(
  inst: Ir.Instruction.UnaryOp,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  const map: {
    [O in Ir.Instruction.UnaryOp["op"]]: (
      state: State<readonly ["a", ...S]>,
    ) => State<readonly [Stack.Brand, ...S]>;
  } = {
    // `!` takes a bool, so it is a logical not, not a bitwise one
    not: ISZERO({ debug }),
    neg: pipe<readonly ["a", ...S]>()
      .then(rebrandTop("b"))
      .then(PUSHn(0n, { debug }), { as: "a" })
      .then(SUB({ debug }))
      .done(),
  };

  return pipe<S>()
    .then(loadValue(inst.operand, { debug }), { as: "a" })
    .then(map[inst.op], { as: "value" })
    .then(storeValueIfNeeded(inst.dest, { debug }))
    .done();
}
