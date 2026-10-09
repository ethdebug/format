import * as Ir from "#ir";
import type { Stack } from "#evm";
import { Type as BugType } from "#types";

import type { State } from "#evmgen/state";
import { type Transition, rebrand, pipe, operations } from "#evmgen/operations";
import { calculateSize } from "#evmgen/serialize";
import { Memory } from "#evmgen/analysis";

import { loadValue, storeValueIfNeeded } from "../values/index.js";
import { generateCastSteps } from "./cast.js";

const {
  SWAP1,
  PUSHn,
  SLOAD,
  SSTORE,
  MLOAD,
  MSTORE,
  MSTORE8,
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
// Uses scratch space at 0x00 (Solidity convention). Must NOT use
// 0x60 because the function calling convention stores the return
// PC there.
const SCRATCH_OFFSET = 0x00n;

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
    return generateTransientRead(inst, debug);
  }

  // Handle memory reads
  if (inst.location === "memory" && inst.offset) {
    const length = inst.length?.kind === "const" ? inst.length.value : 32n;
    if (length === 32n) {
      return pipe<S>()
        .then(loadValue(inst.offset, { debug }), { as: "offset" })
        .then(MLOAD({ debug }), { as: "value" })
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done();
    }

    // A narrower read: MLOAD reads the bytes left-aligned, so shift
    // them right, which leaves only those bytes
    return pipe<S>()
      .then(loadValue(inst.offset, { debug }), { as: "offset" })
      .then(MLOAD({ debug }), { as: "value" })
      .then(PUSHn((32n - BigInt(length)) * 8n, { debug }), { as: "shift" })
      .then(SHR({ debug }), { as: "value" })
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
 * Sign-extend a value read from (transient) storage to a full word,
 * when its type is a signed integer narrower than a word. Storage
 * keeps such a value in its own bytes only.
 */
function signExtend<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<readonly ["value", ...S], readonly ["value", ...S]> {
  return generateCastSteps<S>(
    Ir.Utils.castSteps(inst.type, Ir.Type.Scalar.uint256),
    debug,
  );
}

/** Whether a storage offset is the constant 0 (or absent) */
function isZero(offset: Ir.Value | undefined): boolean {
  return !offset || (offset.kind === "const" && BigInt(offset.value) === 0n);
}

/**
 * Push a storage offset in bits: `offset * 8`. A storage array's
 * element that shares its slot has an offset known only at run time.
 */
function bitOffset<S extends Stack>(
  offset: Ir.Value | undefined,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["shift", ...S]> {
  if (!offset || offset.kind === "const") {
    const bytes = offset ? BigInt(offset.value as bigint) : 0n;
    return pipe<S>()
      .then(PUSHn(bytes * 8n, { debug }), { as: "shift" })
      .done();
  }
  return pipe<S>()
    .then(loadValue(offset, { debug }), { as: "value" })
    .then(PUSHn(3n, { debug }), { as: "shift" })
    .then(SHL({ debug }), { as: "shift" })
    .done();
}

/**
 * Storage read: SLOAD with optional partial-slot extraction
 */
function generateStorageRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["value", ...S]> {
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (isMemoryBytes(inst.type)) {
    return generateBytesStorageRead(inst, debug);
  }

  if (isZero(inst.offset) && length === 32n) {
    // Full slot read - simple SLOAD
    return pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(SLOAD({ debug }), { as: "value" })
      .then(signExtend(inst, debug))
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Partial read - extract specific bytes via shift+mask
  return (
    pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(SLOAD({ debug }), { as: "value" })

      // Shift right by offset * 8 bits: storage writes count `offset`
      // from the low-order end of the slot
      .then(bitOffset(inst.offset, debug), { as: "shift" })
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
      .then(signExtend(inst, debug))
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done()
  );
}

/**
 * Transient storage read: TLOAD with optional partial extraction.
 * Same shift+mask logic as regular storage reads.
 */
function generateTransientRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["value", ...S]> {
  const offset = inst.offset?.kind === "const" ? inst.offset.value : 0n;
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (offset === 0n && length === 32n) {
    return pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(TLOAD({ debug }), { as: "value" })
      .then(signExtend(inst, debug))
      .then(storeValueIfNeeded(inst.dest, { debug }))
      .done();
  }

  // Partial read - same shift+mask as storage
  return (
    pipe<S>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .then(TLOAD({ debug }), { as: "value" })

      .then(PUSHn((32n - BigInt(offset) - BigInt(length)) * 8n, { debug }), {
        as: "shift",
      })
      .then(SHR({ debug }), { as: "shiftedValue" })
      .then(PUSHn(1n, { debug }), { as: "b" })

      // mask = (1 << (length * 8)) - 1
      .then(PUSHn(1n, { debug }), { as: "value" })
      .then(PUSHn(BigInt(length) * 8n, { debug }), {
        as: "shift",
      })
      .then(SHL({ debug }), { as: "a" })
      .then(SUB({ debug }), { as: "mask" })
      .then(
        rebrand<"mask", "a", "shiftedValue", "b">({
          1: "a",
          2: "b",
        }),
      )

      .then(AND({ debug }), { as: "value" })
      .then(signExtend(inst, debug))
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
 * memory at 0x00, then MLOAD to read.
 *
 * Stack effect: copies `length` bytes from `offset` in the
 * source to memory[0x00], then loads the 32-byte word.
 */
function generateCopyBasedRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
  copyOp: typeof RETURNDATACOPY | typeof CODECOPY,
): Transition<S, readonly ["value", ...S]> {
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (length === 32n) {
    // Full 32-byte read — copy and load directly
    return (
      pipe<S>()
        // Zero out scratch: MSTORE(0x60, 0)
        .then(PUSHn(0n, { debug }), { as: "value" })
        .then(PUSHn(SCRATCH_OFFSET, { debug }), { as: "offset" })
        .then(MSTORE({ debug }))

        // COPY(destOffset=0x60, offset, size=32)
        .then(PUSHn(32n, { debug }), { as: "size" })
        .then(loadValue(inst.offset!, { debug }), {
          as: "offset",
        })
        .then(PUSHn(SCRATCH_OFFSET, { debug }), {
          as: "destOffset",
        })
        .then(copyOp({ debug }))

        // MLOAD from scratch
        .then(PUSHn(SCRATCH_OFFSET, { debug }), {
          as: "offset",
        })
        .then(MLOAD({ debug }), { as: "value" })
        .then(storeValueIfNeeded(inst.dest, { debug }))
        .done()
    );
  }

  // Partial read: copy `length` bytes to scratch, MLOAD
  // returns left-aligned data, shift right to right-align,
  // then mask.
  return (
    pipe<S>()
      // Zero out scratch: MSTORE(0x60, 0)
      .then(PUSHn(0n, { debug }), { as: "value" })
      .then(PUSHn(SCRATCH_OFFSET, { debug }), { as: "offset" })
      .then(MSTORE({ debug }))

      // COPY(destOffset=0x60, offset, size=length)
      .then(PUSHn(BigInt(length), { debug }), { as: "size" })
      .then(loadValue(inst.offset!, { debug }), {
        as: "offset",
      })
      .then(PUSHn(SCRATCH_OFFSET, { debug }), {
        as: "destOffset",
      })
      .then(copyOp({ debug }))

      // MLOAD from scratch — value is left-aligned
      .then(PUSHn(SCRATCH_OFFSET, { debug }), {
        as: "offset",
      })
      .then(MLOAD({ debug }), { as: "value" })

      // Shift right to right-align
      .then(PUSHn((32n - BigInt(length)) * 8n, { debug }), { as: "shift" })
      .then(SHR({ debug }), { as: "shiftedValue" })
      .then(PUSHn(1n, { debug }), { as: "b" })

      // mask = (1 << (length * 8)) - 1
      .then(PUSHn(1n, { debug }), { as: "value" })
      .then(PUSHn(BigInt(length) * 8n, { debug }), {
        as: "shift",
      })
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
    const length = inst.length?.kind === "const" ? inst.length.value : 32n;
    // A one-byte write (a `bytes` element) stores only the value's
    // low byte
    const store = length === 1n ? MSTORE8 : MSTORE;
    return pipe<S>()
      .then(loadValue(inst.value, { debug }), { as: "value" })
      .then(loadValue(inst.offset, { debug }), { as: "offset" })
      .then(store({ debug }))
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
  const length = inst.length?.kind === "const" ? inst.length.value : 32n;

  if (isMemoryBytes(inst.value!.type)) {
    return generateBytesStorageWrite(inst, debug);
  }

  if (isZero(inst.offset) && length === 32n) {
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
      .then(bitOffset(inst.offset, debug), { as: "bitOffset" })
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

      // Prepare new value at offset, masked to its length so that
      // a sign-extended negative value cannot clobber its neighbors
      .then(loadValue(inst.value!, { debug }), { as: "b" })
      .then(PUSHn((1n << (BigInt(length) * 8n)) - 1n, { debug }), {
        as: "a",
      })
      .then(AND({ debug }), { as: "value" })
      .then(bitOffset(inst.offset, debug), { as: "shift" })
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

/**
 * Whether a value is a reference to a string or `bytes` in memory: a
 * length word, then the data
 */
function isMemoryBytes(type: Ir.Type): boolean {
  return (
    type.kind === "ref" &&
    type.location === "memory" &&
    type.origin !== "synthetic" &&
    BugType.isElementary(type.origin) &&
    (BugType.Elementary.isString(type.origin) ||
      (BugType.Elementary.isBytes(type.origin) &&
        type.origin.size === undefined))
  );
}

type Step = (state: State<Stack>) => State<Stack>;
type Op = (options?: { debug: Ir.Instruction.Debug }) => Step;

/**
 * Untyped steps, for routines with loops (whose stack the typed
 * `pipe` cannot follow): an op by name, a push, a push of a jump
 * target patched to the offset of a label, and a label's JUMPDEST
 */
function rawSteps(debug: Ir.Instruction.Debug) {
  const raw = operations as unknown as Record<string, Op>;
  const op =
    (name: string): Step =>
    (state) =>
      raw[name]({ debug })(state);
  const push =
    (value: bigint): Step =>
    (state) =>
      (operations.PUSHn(value, { debug }) as unknown as Step)(state);
  const target =
    (label: string): Step =>
    (state) => {
      const index = state.instructions.length;
      const pushed = (operations.PUSH2([0, 0], { debug }) as unknown as Step)(
        state,
      );
      return {
        ...pushed,
        patches: [...pushed.patches, { index, target: label }],
      };
    };
  const mark =
    (label: string): Step =>
    (state) => {
      const marked = {
        ...state,
        blockOffsets: {
          ...state.blockOffsets,
          [label]: calculateSize(state.instructions),
        },
      };
      return op("JUMPDEST")(marked);
    };

  // [n, ...] to [(n + 31) >> 5, ...]: the words n bytes need
  const words: Step[] = [push(31n), op("ADD"), push(5n), op("SHR")];

  return { op, push, target, mark, words };
}

/**
 * Store a string or `bytes` from memory as Solidity encodes it in
 * storage. Up to 31 bytes go in the slot itself, left-aligned, with
 * length * 2 in the low byte. Longer data puts length * 2 + 1 in the
 * slot and the data in the slots from keccak256(slot). The bytes
 * after the end of the data, in its last word, are stored as zero.
 *
 *   [slot, ptr]   DUP2 MLOAD
 *   [len, ...]    PUSH1 31 DUP2 GT PUSH2 long JUMPI
 *                 DUP3 PUSH1 32 ADD MLOAD DUP2 <mask>
 *                 DUP2 DUP1 ADD OR DUP3 SSTORE PUSH2 end JUMP
 *   long:         JUMPDEST DUP1 DUP1 ADD PUSH1 1 ADD DUP3 SSTORE
 *                 DUP2 PUSH0 MSTORE PUSH1 32 PUSH0 KECCAK256
 *                 DUP4 PUSH1 32 ADD DUP3 DUP2 ADD
 *   loop:         JUMPDEST            [end, src, dataSlot, len, ...]
 *                 DUP2 MLOAD DUP3 DUP3 SUB <mask> DUP4 SSTORE
 *                 SWAP2 PUSH1 1 ADD SWAP2 SWAP1 PUSH1 32 ADD SWAP1
 *                 DUP2 DUP2 GT PUSH2 loop JUMPI POP POP POP
 *   end:          JUMPDEST POP POP POP
 *
 * `<mask>` takes [k, word] to the word with all but its first k bytes
 * cleared, when k < 32: it shifts the word right, then left, by
 * (k < 32) * (256 - 8k) bits.
 */
function generateBytesStorageWrite<S extends Stack>(
  inst: Ir.Instruction.Write,
  debug: Ir.Instruction.Debug,
): Transition<S, S> {
  const { op, push, target, mark, words } = rawSteps(debug);

  const mask: Step[] = [
    op("DUP1"),
    push(3n),
    op("SHL"),
    push(256n),
    op("SUB"),
    op("SWAP1"),
    push(32n),
    op("SWAP1"),
    op("LT"),
    op("MUL"),
    op("DUP1"),
    op("SWAP2"),
    op("SWAP1"),
    op("SHR"),
    op("SWAP1"),
    op("SHL"),
  ];

  return ((state: State<Stack>): State<Stack> => {
    const id = state.nextId;
    const long = `$bytes_long_${id}`;
    const loop = `$bytes_loop_${id}`;
    const end = `$bytes_end_${id}`;
    const clearLoop = `$bytes_clear_${id}`;
    const cleared = `$bytes_cleared_${id}`;

    // [slot, ptr] to [slot, ptr], with the data words of the old value
    // that the new one does not use set to zero, as Solidity does
    const clear: Step[] = [
      // The words the new value uses: (len > 31) * ((len + 31) >> 5)
      op("DUP2"),
      op("MLOAD"),
      op("DUP1"),
      push(31n),
      op("LT"),
      op("SWAP1"),
      ...words,
      op("MUL"),

      // The words the old one uses: (old & 1) * (((old >> 1) + 31) >> 5)
      op("DUP2"),
      op("SLOAD"),
      op("DUP1"),
      push(1n),
      op("AND"),
      op("SWAP1"),
      push(1n),
      op("SHR"),
      ...words,
      op("MUL"),

      // [end, next] = [base + old words, base + new words]
      op("DUP3"),
      push(0n),
      op("MSTORE"),
      push(32n),
      push(0n),
      op("KECCAK256"),
      op("DUP1"),
      op("SWAP2"),
      op("ADD"),
      op("SWAP2"),
      op("ADD"),
      op("SWAP1"),

      mark(clearLoop),
      op("DUP1"),
      op("DUP3"),
      op("LT"),
      op("ISZERO"),
      target(cleared),
      op("JUMPI"),
      push(0n),
      op("DUP3"),
      op("SSTORE"),
      op("SWAP1"),
      push(1n),
      op("ADD"),
      op("SWAP1"),
      target(clearLoop),
      op("JUMP"),

      mark(cleared),
      op("POP"),
      op("POP"),
    ];

    const loaded = pipe<Stack>()
      .then(loadValue(inst.value!, { debug }), { as: "value" })
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .done()({ ...state, nextId: id + 1 }) as State<Stack>;

    const steps: Step[] = [
      ...clear,

      op("DUP2"),
      op("MLOAD"),
      push(31n),
      op("DUP2"),
      op("GT"),
      target(long),
      op("JUMPI"),

      op("DUP3"),
      push(32n),
      op("ADD"),
      op("MLOAD"),
      op("DUP2"),
      ...mask,
      op("DUP2"),
      op("DUP1"),
      op("ADD"),
      op("OR"),
      op("DUP3"),
      op("SSTORE"),
      target(end),
      op("JUMP"),

      mark(long),
      op("DUP1"),
      op("DUP1"),
      op("ADD"),
      push(1n),
      op("ADD"),
      op("DUP3"),
      op("SSTORE"),
      op("DUP2"),
      push(0n),
      op("MSTORE"),
      push(32n),
      push(0n),
      op("KECCAK256"),
      op("DUP4"),
      push(32n),
      op("ADD"),
      op("DUP3"),
      op("DUP2"),
      op("ADD"),

      mark(loop),
      op("DUP2"),
      op("MLOAD"),
      op("DUP3"),
      op("DUP3"),
      op("SUB"),
      ...mask,
      op("DUP4"),
      op("SSTORE"),
      op("SWAP2"),
      push(1n),
      op("ADD"),
      op("SWAP2"),
      op("SWAP1"),
      push(32n),
      op("ADD"),
      op("SWAP1"),
      op("DUP2"),
      op("DUP2"),
      op("GT"),
      target(loop),
      op("JUMPI"),
      op("POP"),
      op("POP"),
      op("POP"),

      mark(end),
      op("POP"),
      op("POP"),
      op("POP"),
    ];

    return steps.reduce<State<Stack>>((current, step) => step(current), loaded);
  }) as unknown as Transition<S, S>;
}

/**
 * Copy a string or `bytes` from storage, as Solidity encodes it there
 * (see `generateBytesStorageWrite`), into new memory: a length word,
 * then the data, in whole words. Leaves the copy's address.
 *
 *   [slot]        DUP1 SLOAD DUP1 PUSH1 1 AND PUSH2 long JUMPI
 *   [word, slot]  DUP1 PUSH1 0xff AND PUSH1 1 SHR PUSH1 64 <alloc>
 *                 SWAP1 DUP2 MSTORE SWAP1 PUSH1 0xff NOT AND
 *                 DUP2 PUSH1 32 ADD MSTORE PUSH2 end JUMP
 *   long:         JUMPDEST PUSH1 1 SHR DUP1 <words> PUSH1 5 SHL
 *                 PUSH1 32 ADD <alloc> DUP2 DUP2 MSTORE
 *                 DUP4 PUSH0 MSTORE PUSH1 32 PUSH0 KECCAK256
 *                 DUP2 PUSH1 32 ADD DUP4 <words> PUSH1 5 SHL DUP2 ADD
 *   loop:         JUMPDEST            [end, dst, dataSlot, ptr, len, slot]
 *                 DUP1 DUP3 LT ISZERO PUSH2 done JUMPI
 *                 DUP3 SLOAD DUP3 MSTORE
 *                 SWAP2 PUSH1 1 ADD SWAP2 SWAP1 PUSH1 32 ADD SWAP1
 *                 PUSH2 loop JUMP
 *   done:         JUMPDEST POP POP POP SWAP1 POP
 *   end:          JUMPDEST SWAP1 POP  [ptr, slot] to [ptr]
 *
 * `<alloc>` takes [size] to [ptr], moving the free memory pointer past
 * `size` bytes. The data's last word holds zero past its end, as the
 * write stores it.
 *
 * Unlike Solidity, this does not check the encoding (Solidity reverts
 * with `Panic(0x22)` on a bad one): a corrupt long length allocates as
 * much memory as it says, and runs out of gas.
 */
function generateBytesStorageRead<S extends Stack>(
  inst: Ir.Instruction.Read,
  debug: Ir.Instruction.Debug,
): Transition<S, readonly ["value", ...S]> {
  const { op, push, target, mark, words } = rawSteps(debug);
  const fmp = BigInt(Memory.regions.FREE_MEMORY_POINTER);

  // [size, ...] to [ptr, ...]
  const alloc: Step[] = [
    push(fmp),
    op("MLOAD"),
    op("SWAP1"),
    op("DUP2"),
    op("ADD"),
    push(fmp),
    op("MSTORE"),
  ];

  return ((state: State<Stack>): State<Stack> => {
    const id = state.nextId;
    const long = `$bytes_read_long_${id}`;
    const loop = `$bytes_read_loop_${id}`;
    const done = `$bytes_read_done_${id}`;
    const end = `$bytes_read_end_${id}`;

    const loaded = pipe<Stack>()
      .then(loadValue(inst.slot!, { debug }), { as: "key" })
      .done()({ ...state, nextId: id + 1 }) as State<Stack>;

    const steps: Step[] = [
      op("DUP1"),
      op("SLOAD"),
      op("DUP1"),
      push(1n),
      op("AND"),
      target(long),
      op("JUMPI"),

      // Short: the length is the low byte / 2, the data the rest
      op("DUP1"),
      push(0xffn),
      op("AND"),
      push(1n),
      op("SHR"),
      push(64n),
      ...alloc,
      op("SWAP1"),
      op("DUP2"),
      op("MSTORE"),
      op("SWAP1"),
      push(0xffn),
      op("NOT"),
      op("AND"),
      op("DUP2"),
      push(32n),
      op("ADD"),
      op("MSTORE"),
      target(end),
      op("JUMP"),

      // Long: the length is the word / 2; the data from keccak256(slot)
      mark(long),
      push(1n),
      op("SHR"),
      op("DUP1"),
      ...words,
      push(5n),
      op("SHL"),
      push(32n),
      op("ADD"),
      ...alloc,
      op("DUP2"),
      op("DUP2"),
      op("MSTORE"),
      op("DUP3"),
      push(0n),
      op("MSTORE"),
      push(32n),
      push(0n),
      op("KECCAK256"),
      op("DUP2"),
      push(32n),
      op("ADD"),
      op("DUP4"),
      ...words,
      push(5n),
      op("SHL"),
      op("DUP2"),
      op("ADD"),

      mark(loop),
      op("DUP1"),
      op("DUP3"),
      op("LT"),
      op("ISZERO"),
      target(done),
      op("JUMPI"),
      op("DUP3"),
      op("SLOAD"),
      op("DUP3"),
      op("MSTORE"),
      op("SWAP2"),
      push(1n),
      op("ADD"),
      op("SWAP2"),
      op("SWAP1"),
      push(32n),
      op("ADD"),
      op("SWAP1"),
      target(loop),
      op("JUMP"),

      mark(done),
      op("POP"),
      op("POP"),
      op("POP"),
      op("SWAP1"),
      op("POP"),

      // Both ways reach here with [ptr, slot]
      mark(end),
      op("SWAP1"),
      op("POP"),
    ];

    const copied = steps.reduce<State<Stack>>(
      (current, step) => step(current),
      loaded,
    );
    return (storeValueIfNeeded(inst.dest, { debug }) as unknown as Step)(
      copied,
    );
  }) as unknown as Transition<S, readonly ["value", ...S]>;
}
