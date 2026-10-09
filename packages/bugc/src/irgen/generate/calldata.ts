/**
 * Bytes in calldata: `msg.data`, its slices, and the locals they
 * initialize refer to the calldata and are not copied. Such a value is
 * one word: the offset of its first byte in the calldata in the high
 * 128 bits, and its length in the low 128 bits. `msg.data` is offset
 * 0 and length CALLDATASIZE, so its word is the calldata size.
 */
import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Type } from "#types";

import { Process } from "./process.js";

const uint256 = Ir.Type.Scalar.uint256;

/** The bits below the offset: the length */
export const LENGTH_BITS = 128n;

const constant = (value: bigint) => Ir.Value.constant(value, uint256);

/** The IR type of bytes in calldata */
export const calldataType = (): Ir.Type =>
  Ir.Type.ref("calldata", Type.Elementary.calldataBytes());

export const isCalldata = (value: Ir.Value): boolean =>
  Ir.Type.isRef(value.type) && value.type.location === "calldata";

/** The offset and length of bytes in calldata */
export interface Bounds {
  offset: Ir.Value;
  length: Ir.Value;
}

function* emitBinary(
  op: Ir.Instruction.BinaryOp["op"],
  left: Ir.Value,
  right: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const dest = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op,
    left,
    right,
    dest,
    operationDebug: yield* Process.Debug.forAstNode(node),
  } as Ir.Instruction.BinaryOp);
  return Ir.Value.temp(dest, uint256);
}

/** `left + right`, or `right` when `left` is the constant 0 */
export function* emitOffsetSum(
  left: Ir.Value,
  right: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  if (left.kind === "const" && left.value === 0n) return right;
  return yield* emitBinary("add", left, right, node);
}

/** The offset and length of the bytes in calldata a word refers to */
export function* emitBounds(word: Ir.Value, node: Ast.Node): Process<Bounds> {
  return {
    offset: yield* emitBinary("shr", word, constant(LENGTH_BITS), node),
    length: yield* emitBinary(
      "and",
      word,
      constant((1n << LENGTH_BITS) - 1n),
      node,
    ),
  };
}

/** The word that refers to `length` bytes of calldata at `offset` */
export function* emitWord(
  { offset, length }: Bounds,
  node: Ast.Node,
): Process<Ir.Value> {
  const high = yield* emitBinary("shl", offset, constant(LENGTH_BITS), node);
  const word = yield* emitBinary("or", high, length, node);
  return { ...word, type: calldataType() };
}

/**
 * Copy bytes in calldata to new memory, as a length word and then the
 * data. The copy has the type `origin` (`bytes` unless given).
 */
export function* emitCopyToMemory(
  word: Ir.Value,
  node: Ast.Node,
  origin: Type = Type.Elementary.bytes(),
): Process<Ir.Value> {
  const { offset, length } = yield* emitBounds(word, node);
  const debug = yield* Process.Debug.forAstNode(node);

  const size = yield* emitBinary("add", length, constant(32n), node);
  const base = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "allocate",
    location: "memory",
    size,
    dest: base,
    operationDebug: debug,
  } as Ir.Instruction.Allocate);

  const baseValue = Ir.Value.temp(base, uint256);
  yield* Process.Instructions.emit({
    kind: "write",
    location: "memory",
    offset: baseValue,
    length: constant(32n),
    value: length,
    operationDebug: debug,
  } as Ir.Instruction.Write);

  const data = yield* emitBinary("add", baseValue, constant(32n), node);
  yield* Process.Instructions.emit({
    kind: "copy",
    location: "calldata",
    source: offset,
    offset: data,
    length,
    operationDebug: debug,
  } as Ir.Instruction.Copy);

  return Ir.Value.temp(base, Ir.Type.ref("memory", origin));
}

/**
 * A value, or, if it is bytes or a string in calldata, a copy of them
 * in memory, typed `bytes` or `string`
 */
export function* emitInMemory(
  value: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  if (!isCalldata(value)) return value;
  const { origin } = value.type;
  return yield* emitCopyToMemory(
    value,
    node,
    origin === "synthetic" ? undefined : Type.Elementary.inMemory(origin),
  );
}
