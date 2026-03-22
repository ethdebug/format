/**
 * Compute offset instruction code generation
 */

import * as Ir from "#ir";
import type { Stack } from "#evm";
import { assertExhausted } from "#evmgen/errors";

import { type Transition, pipe, rebrand, operations } from "#evmgen/operations";
import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { MUL, ADD } = operations;

/**
 * Generate code for compute_offset instructions
 * Computes: base + (index * stride) + byteOffset/fieldOffset
 */
export function generateComputeOffset<S extends Stack>(
  inst: Ir.Instruction.ComputeOffset,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  // For now, handle memory/calldata/returndata the same way
  // The location property may matter for future optimizations or bounds checking

  // Handle index-based offset (for arrays)
  if (Ir.Instruction.ComputeOffset.isArray(inst)) {
    return (
      pipe<S>()
        // Load base address
        .then(loadValue(inst.base, { debug }), { as: "base" })
        .then(loadValue(inst.index, { debug }), { as: "index" })
        // Load stride
        .then(
          loadValue(
            Ir.Value.constant(BigInt(inst.stride), Ir.Type.Scalar.uint256),
            { debug },
          ),
          { as: "stride" },
        )
        .then(rebrand<"stride", "a", "index", "b">({ 1: "a", 2: "b" }))
        // Compute index * stride
        .then(MUL({ debug }), { as: "scaled_index" })
        // Add to base
        .then(rebrand<"scaled_index", "a", "base", "b">({ 1: "a", 2: "b" }))
        .then(ADD({ debug }), { as: "value" })
        // Store the result
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  // Handle field offset (for structs)
  if (Ir.Instruction.ComputeOffset.isField(inst)) {
    if (inst.fieldOffset === 0) {
      // No offset needed, just load the base
      return pipe<S>()
        .then(loadValue(inst.base, { debug }), { as: "value" })
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done();
    }
    return (
      pipe<S>()
        // Load base address
        .then(loadValue(inst.base, { debug }), { as: "base" })
        .then(
          loadValue(
            Ir.Value.constant(BigInt(inst.fieldOffset), Ir.Type.Scalar.uint256),
            { debug },
          ),
          { as: "field_offset" },
        )
        .then(rebrand<"field_offset", "a", "base", "b">({ 1: "a", 2: "b" }))
        .then(ADD({ debug }), { as: "value" })
        // Store the result
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  // Handle byte offset
  if (Ir.Instruction.ComputeOffset.isByte(inst)) {
    return (
      pipe<S>()
        // Load base address
        .then(loadValue(inst.base, { debug }), { as: "base" })
        .then(loadValue(inst.offset, { debug }), { as: "byte_offset" })
        .then(rebrand<"byte_offset", "a", "base", "b">({ 1: "a", 2: "b" }))
        .then(ADD({ debug }), { as: "value" })
        // Store the result
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  assertExhausted(inst);
  throw new Error(`Unknown compute_offset type`);
}
