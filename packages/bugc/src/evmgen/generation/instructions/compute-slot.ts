import * as Ir from "#ir";

import type { Stack } from "#evm";

import { type Transition, pipe, operations } from "#evmgen/operations";

import { loadValue, storeValueIfNeeded } from "../values/index.js";

const { PUSHn, MSTORE, KECCAK256, ADD } = operations;

/**
 * Generate code for computing a storage slot based on kind
 */
export function generateComputeSlot<S extends Stack>(
  inst: Ir.Instruction.ComputeSlot,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  if (Ir.Instruction.ComputeSlot.isMapping(inst)) {
    // For mappings: keccak256(key || baseSlot)
    if (!inst.key) {
      throw new Error("Mapping compute_slot requires key");
    }
    return (
      pipe<S>()
        // store key then base in memory as 32 bytes each
        .then(loadValue(inst.key, { debug }))
        .then(PUSHn(0n, { debug }), { as: "offset" })
        .then(MSTORE({ debug }))

        .then(loadValue(inst.base, { debug }))
        .then(PUSHn(32n, { debug }), { as: "offset" })
        .then(MSTORE({ debug }))
        .then(PUSHn(64n, { debug }), { as: "size" })
        .then(PUSHn(0n, { debug }), { as: "offset" })
        .then(KECCAK256({ debug }), { as: "value" })
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  if (Ir.Instruction.ComputeSlot.isArray(inst)) {
    // For arrays: just compute keccak256(base) - the first slot
    // The index will be added separately by the IR generator
    return (
      pipe<S>()
        // Store base at memory offset 0
        .then(loadValue(inst.base, { debug }))
        .then(PUSHn(0n, { debug }), { as: "offset" })
        .then(MSTORE({ debug }))

        // Hash 32 bytes starting at offset 0
        .then(PUSHn(32n, { debug }), { as: "size" })
        .then(PUSHn(0n, { debug }), { as: "offset" })
        .then(KECCAK256({ debug }), { as: "value" })
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  if (Ir.Instruction.ComputeSlot.isField(inst)) {
    // For struct fields: base + (fieldOffset / 32) to get the slot
    if (inst.fieldOffset === undefined) {
      throw new Error("Field compute_slot requires fieldOffset");
    }
    // Convert byte offset to slot offset
    const slotOffset = Math.floor(inst.fieldOffset / 32);
    return pipe<S>()
      .then(loadValue(inst.base, { debug }), { as: "b" })
      .then(PUSHn(BigInt(slotOffset), { debug }), { as: "a" })
      .then(ADD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // This should never be reached due to exhaustive type checking
  const _exhaustive: never = inst;
  void _exhaustive;
  throw new Error(`Unknown compute_slot kind`);
}
