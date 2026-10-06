import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Process } from "./process.js";

/**
 * Revert with `Panic(0x32)` unless `left` is less than `right` (or
 * equal to it, for `op` "le"), compared as unsigned words: the type
 * checker allows only unsigned indexes, and a signed comparison would
 * let a negative index through.
 */
export function* emitBoundsCheck(
  op: "lt" | "le",
  left: Ir.Value,
  right: Ir.Value,
  node: Ast.Node | undefined,
): Process<void> {
  const debug = node ? yield* Process.Debug.forAstNode(node) : {};

  const condition = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op,
    left: unsigned(left),
    right: unsigned(right),
    dest: condition,
    operationDebug: debug,
  } as Ir.Instruction.BinaryOp);

  yield* Process.Instructions.emit({
    kind: "assert",
    condition: Ir.Value.temp(condition, Ir.Type.Scalar.bool),
    panic: Ir.Instruction.Assert.outOfBounds,
    operationDebug: debug,
  } as Ir.Instruction.Assert);
}

/**
 * The length of an array or `bytes` in memory: the word at its
 * address. (For `msg.data`, code generation reads the calldata size.)
 */
export function* emitLength(
  object: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const length = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "length",
    object,
    dest: length,
    operationDebug: yield* Process.Debug.forAstNode(node),
  } as Ir.Instruction.Length);
  return Ir.Value.temp(length, Ir.Type.Scalar.uint256);
}

/**
 * Compute the address of a memory array's element, reverting if the
 * index is out of bounds.
 *
 * An array in memory is the address of its length word; one word per
 * element follows the length.
 */
export function* emitMemoryElementOffset(
  array: Ir.Value,
  index: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const length = yield* emitLength(array, node);
  yield* emitBoundsCheck("lt", index, length, node);

  const debug = yield* Process.Debug.forAstNode(node);

  const elementsBase = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op: "add",
    left: array,
    right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
    dest: elementsBase,
    operationDebug: debug,
  } as Ir.Instruction.BinaryOp);

  const offset = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit(
    Ir.Instruction.ComputeOffset.array(
      "memory",
      Ir.Value.temp(elementsBase, Ir.Type.Scalar.uint256),
      index,
      32,
      offset,
      debug,
    ),
  );

  return Ir.Value.temp(offset, Ir.Type.Scalar.uint256);
}

/**
 * Compute the address of a byte of `bytes` in memory, reverting if
 * the index is out of bounds.
 *
 * A `bytes` value in memory is the address of its length word; the
 * data follows the length.
 */
export function* emitMemoryByteOffset(
  bytes: Ir.Value,
  index: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const length = yield* emitLength(bytes, node);
  yield* emitBoundsCheck("lt", index, length, node);

  const debug = yield* Process.Debug.forAstNode(node);

  const dataBase = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op: "add",
    left: bytes,
    right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
    dest: dataBase,
    operationDebug: debug,
  } as Ir.Instruction.BinaryOp);

  const offset = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit(
    Ir.Instruction.ComputeOffset.byte(
      "memory",
      Ir.Value.temp(dataBase, Ir.Type.Scalar.uint256),
      index,
      offset,
      debug,
    ),
  );

  return Ir.Value.temp(offset, Ir.Type.Scalar.uint256);
}

/** `value` as a uint256, so a comparison of it is unsigned */
function unsigned(value: Ir.Value): Ir.Value {
  const type = Ir.Type.Scalar.uint256;
  return value.kind === "const" && typeof value.value === "bigint"
    ? { ...value, value: BigInt.asUintN(256, value.value), type }
    : { ...value, type };
}
