import * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, operations, pipe, rebrand } from "#evmgen/operations";

import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { ADD, AND, DUP1, MLOAD, NOT, PUSHn, SHL, SHR, SIGNEXTEND, SWAP1 } =
  operations;

/**
 * Generate code for cast instructions: truncate, sign-extend or shift
 * the value as `Ir.Utils.castSteps` says for its source and target
 * types. Most widening casts emit no code.
 */
export function generateCast<S extends Stack>(
  inst: Ir.Instruction.Cast,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;
  const steps = Ir.Utils.castSteps(inst.value.type, inst.targetType);

  const cast = steps
    .map((step) => generateStep<S>(step, debug))
    .reduce<Transition<readonly ["value", ...S], readonly ["value", ...S]>>(
      (previous, next) => (state) => next(previous(state)),
      (state) => state,
    );

  return pipe<S>()
    .then(loadValue(inst.value, { debug }), { as: "value" })
    .then(cast)
    .then(storeValueIfNeeded(inst.dest, { debug }))
    .done();
}

function generateStep<S extends Stack>(
  step: Ir.Utils.CastStep,
  debug: Ir.Instruction.Debug | undefined,
): Transition<readonly ["value", ...S], readonly ["value", ...S]> {
  switch (step.op) {
    case "and":
      return pipe<readonly ["value", ...S]>()
        .then(rebrand<"value", "b">({ 1: "b" }))
        .then(PUSHn((1n << BigInt(step.bytes * 8)) - 1n, { debug }), {
          as: "a",
        })
        .then(AND({ debug }), { as: "value" })
        .done();
    case "signextend":
      return pipe<readonly ["value", ...S]>()
        .then(rebrand<"value", "x">({ 1: "x" }))
        .then(PUSHn(BigInt(step.bytes - 1), { debug }), { as: "b" })
        .then(SIGNEXTEND({ debug }), { as: "value" })
        .done();
    case "shr":
      return pipe<readonly ["value", ...S]>()
        .then(PUSHn(BigInt(step.bytes * 8), { debug }), { as: "shift" })
        .then(SHR({ debug }), { as: "value" })
        .done();
    case "shl":
      return pipe<readonly ["value", ...S]>()
        .then(PUSHn(BigInt(step.bytes * 8), { debug }), { as: "shift" })
        .then(SHL({ debug }), { as: "value" })
        .done();
    case "load":
      return generateLoad<S>(debug);
  }
}

/**
 * Replace a reference to dynamic `bytes` in memory with its first 32
 * bytes, zeroing the bytes past its length:
 * `mload(ref + 32) & ~(~0 >> (8 * length))`
 */
function generateLoad<S extends Stack>(
  debug: Ir.Instruction.Debug | undefined,
): Transition<readonly ["value", ...S], readonly ["value", ...S]> {
  return (
    pipe<readonly ["value", ...S]>()
      // The first 32 bytes
      .then(rebrand<"value", "b">({ 1: "b" }))
      .then(DUP1({ debug }))
      .then(PUSHn(32n, { debug }), { as: "a" })
      .then(ADD({ debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "data" })

      // The length, in bits
      .then(SWAP1({ debug }))
      .then(rebrand<"b", "offset">({ 1: "offset" }))
      .then(MLOAD({ debug }), { as: "value" })
      .then(PUSHn(3n, { debug }), { as: "shift" })
      .then(SHL({ debug }), { as: "shift" })

      // The mask that keeps `length` leading bytes
      .then(PUSHn(0n, { debug }), { as: "a" })
      .then(NOT({ debug }), { as: "value" })
      .then(SWAP1({ debug }))
      .then(SHR({ debug }), { as: "a" })
      .then(NOT({ debug }), { as: "a" })

      .then(rebrand<"a", "a", "data", "b">({ 1: "a", 2: "b" }))
      .then(AND({ debug }), { as: "value" })
      .done()
  );
}
