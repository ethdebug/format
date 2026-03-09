import type * as Ir from "#ir";
import type { Stack } from "#evm";

import { type Transition, rebrand, pipe, operations } from "#evmgen/operations";

import { loadValue, storeValueIfNeeded } from "../values/index.js";

const {
  SWAP1,
  PUSHn,
  SLOAD,
  SSTORE,
  MLOAD,
  MSTORE,
  SHL,
  SHR,
  AND,
  OR,
  NOT,
  SUB,
  DUP1,
  CALLDATALOAD,
  RETURNDATACOPY,
  CODECOPY,
  TLOAD,
  TSTORE,
} = operations;

// Scratch memory address for copy-based reads (returndata, code).
// Uses the "zero slot" at 0x60, which is safe for temporary use.
const SCRATCH_OFFSET = 0x60n;

/**
 * Generate code for the new unified read instruction
 */
export function generateRead<S extends Stack>(
  inst: Ir.Instruction.Read,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  // Handle storage reads
  if (inst.location === "storage" && inst.slot) {
    return generateStorageRead(inst, debug);
  }

  // Handle transient storage reads
  if (inst.location === "transient" && inst.slot) {
    return pipe<S>()
      .then(loadValue(inst.slot, { debug }), { as: "key" })
      .then(TLOAD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Handle memory reads
  if (inst.location === "memory" && inst.offset) {
    return pipe<S>()
      .then(loadValue(inst.offset, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Handle calldata reads
  if (inst.location === "calldata" && inst.offset) {
    return generateCalldataRead(inst, debug);
  }

  // Handle returndata reads (copy to scratch memory, then MLOAD)
  if (inst.location === "returndata" && inst.offset) {
    return generateCopyBasedRead(inst, debug, RETURNDATACOPY);
  }

  // Handle code reads (copy to scratch memory, then MLOAD)
  if (inst.location === "code" && inst.offset) {
    return generateCopyBasedRead(inst, debug, CODECOPY);
  }

  // Unsupported location — push zero to maintain stack typing
  return pipe<S>().then(PUSHn(0n, { debug }), { as: "value" }).done();
}

/**
 * Storage read: SLOAD with optional partial-slot extraction
 */
function generateStorageRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["value", ...S]> {
  const offset = inst.offset?.kind === "const" ? inst.offset.value : 0n;
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (offset === 0n && length === 32n) {
    // Full slot read - simple SLOAD
    return pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(SLOAD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Partial read - extract specific bytes via shift+mask
  return (
    pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(SLOAD({ debug }), { as: "value" })

      // Shift right by (32 - offset - length) * 8 bits
      .then(PUSHn((32n - BigInt(offset) - BigInt(length)) * 8n, { debug }), {
        as: "shift",
      })
      .then(SHR({ debug }), { as: "shiftedValue" })
      .then(PUSHn(1n, { debug }), { as: "b" })

      // mask = (1 << (length * 8)) - 1
      .then(PUSHn(1n, { debug }), { as: "value" })
      .then(PUSHn(BigInt(length) * 8n, { debug }), { as: "shift" })
      .then(SHL({ debug }), { as: "a" })
      .then(SUB({ debug }), { as: "mask" })
      .then(
        rebrand<"mask", "a", "shiftedValue", "b">({
          1: "a",
          2: "b",
        }),
      )

      // shiftedValue & mask
      .then(AND({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done()
  );
}

/**
 * Calldata read: CALLDATALOAD reads 32 bytes at a given offset.
 * For partial reads, shift+mask to extract the desired bytes.
 */
function generateCalldataRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["value", ...S]> {
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (length === 32n) {
    // Full 32-byte read
    return pipe<S>()
      .then(loadValue(inst.offset!, { debug }), { as: "i" })
      .then(CALLDATALOAD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Partial read: CALLDATALOAD returns 32 bytes left-aligned,
  // so shift right by (32 - length) * 8 bits to right-align,
  // then mask.
  return (
    pipe<S>()
      .then(loadValue(inst.offset!, { debug }), { as: "i" })
      .then(CALLDATALOAD({ debug }), { as: "value" })
      .then(PUSHn((32n - BigInt(length)) * 8n, { debug }), { as: "shift" })
      .then(SHR({ debug }), { as: "shiftedValue" })
      .then(PUSHn(1n, { debug }), { as: "b" })

      // mask = (1 << (length * 8)) - 1
      .then(PUSHn(1n, { debug }), { as: "value" })
      .then(PUSHn(BigInt(length) * 8n, { debug }), { as: "shift" })
      .then(SHL({ debug }), { as: "a" })
      .then(SUB({ debug }), { as: "mask" })
      .then(
        rebrand<"mask", "a", "shiftedValue", "b">({
          1: "a",
          2: "b",
        }),
      )

      .then(AND({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done()
  );
}

/**
 * Copy-based read for returndata and code locations.
 * Uses RETURNDATACOPY or CODECOPY to copy data to scratch
 * memory at 0x60, then MLOAD to read.
 *
 * Stack effect: copies `length` bytes from `offset` in the
 * source to memory[0x60], then loads the 32-byte word.
 */
function generateCopyBasedRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
  copyOp: typeof RETURNDATACOPY | typeof CODECOPY,
): Transition<S, readonly ["value", ...S]> {
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  // Clear scratch memory first so partial copies are zero-padded
  return (
    pipe<S>()
      // Zero out scratch: MSTORE(0x60, 0)
      .then(PUSHn(0n, { debug }), { as: "value" })
      .then(PUSHn(SCRATCH_OFFSET, { debug }), { as: "offset" })
      .then(MSTORE({ debug }))

      // COPY(destOffset=0x60, offset, size=length)
      .then(PUSHn(BigInt(length), { debug }), { as: "size" })
      .then(loadValue(inst.offset!, { debug }), { as: "offset" })
      .then(PUSHn(SCRATCH_OFFSET, { debug }), { as: "destOffset" })
      .then(copyOp({ debug }))

      // MLOAD from scratch
      .then(PUSHn(SCRATCH_OFFSET, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "value" })
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done()
  );
}

/**
 * Generate code for the new unified write instruction
 */
export function generateWrite<S extends Stack>(
  inst: Ir.Instruction.Write,
): Transition<S, S> {
  const debug = inst.operationDebug;

  // Handle storage writes
  if (inst.location === "storage" && inst.slot && inst.value) {
    return generateStorageWrite(inst, debug);
  }

  // Handle transient storage writes
  if (inst.location === "transient" && inst.slot && inst.value) {
    return pipe<S>()
      .then(loadValue(inst.value, { debug }), { as: "value" })
      .then(loadValue(inst.slot, { debug }), { as: "key" })
      .then(TSTORE({ debug }))
      .done();
  }

  // Handle memory writes
  if (inst.location === "memory" && inst.offset && inst.value) {
    return pipe<S>()
      .then(loadValue(inst.value, { debug }), { as: "value" })
      .then(loadValue(inst.offset, { debug }), { as: "offset" })
      .then(MSTORE({ debug }))
      .done();
  }

  // Other locations (local, etc.) - no-op
  return (state) => state;
}

/**
 * Storage write: SSTORE with optional partial-slot masking
 */
function generateStorageWrite<S extends Stack>(
  inst: Ir.Instruction.Write,
  debug: Ir.Instruction.Debug,
): Transition<S, S> {
  const offset = inst.offset?.kind === "const" ? inst.offset.value : 0n;
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (offset === 0n && length === 32n) {
    // Full slot write - simple SSTORE
    return pipe<S>()
      .then(loadValue(inst.value!, { debug }), { as: "value" })
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(SSTORE({ debug }))
      .done();
  }

  // Partial write - read-modify-write with masking
  return (
    pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(DUP1({ debug }))

      .then(SLOAD({ debug }), { as: "current" })

      // (1 << (length * 8)) - 1
      .then(PUSHn(1n, { debug }), { as: "b" })
      .then(PUSHn(1n, { debug }), { as: "value" })
      .then(PUSHn(BigInt(length) * 8n, { debug }), { as: "shift" })
      .then(SHL({ debug }), { as: "a" })
      .then(SUB({ debug }), { as: "lengthMask" })

      // Shift mask to offset position
      .then(PUSHn(BigInt(offset) * 8n, { debug }), {
        as: "bitOffset",
      })
      .then(
        rebrand<"bitOffset", "shift", "lengthMask", "value">({
          1: "shift",
          2: "value",
        }),
      )
      .then(SHL({ debug }), { as: "a" })

      // Invert for clear mask
      .then(NOT({ debug }), { as: "clearMask" })
      .then(
        rebrand<"clearMask", "a", "current", "b">({
          1: "a",
          2: "b",
        }),
      )

      // current & clearMask
      .then(AND({ debug }), { as: "clearedCurrent" })

      // Prepare new value at offset
      .then(loadValue(inst.value!, { debug }), { as: "value" })
      .then(PUSHn(BigInt(offset) * 8n, { debug }), { as: "shift" })
      .then(SHL({ debug }), { as: "shiftedValue" })

      .then(
        rebrand<"shiftedValue", "a", "clearedCurrent", "b">({
          1: "a",
          2: "b",
        }),
      )

      // clearedCurrent | shiftedValue
      .then(OR({ debug }), { as: "value" })
      .then(SWAP1({ debug }))

      .then(SSTORE({ debug }))
      .done()
  );
}
