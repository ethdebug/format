import { Type as BugType } from "#types";

import { Type } from "../spec/type.js";
import type { Instruction } from "../spec/instruction.js";

/**
 * Whether a value of this type is a signed integer
 */
export function isSigned(type: Type): boolean {
  return (
    Type.isScalar(type) &&
    type.origin !== "synthetic" &&
    BugType.isElementary(type.origin) &&
    BugType.Elementary.isInt(type.origin)
  );
}

/**
 * Whether a binary operation acts on signed integers, so that it
 * compares, divides, and takes the remainder of two's complement
 * values. A signed value is sign-extended across its word, so the
 * signed opcodes apply at any width.
 */
export function isSignedBinary(inst: Instruction.BinaryOp): boolean {
  return isSigned(inst.left.type) || isSigned(inst.right.type);
}

const word = 2n ** 256n;

/**
 * Evaluate a binary operation on two signed constants as the EVM's
 * signed opcodes do: a comparison gives a boolean, and division or
 * remainder a word. Returns undefined for an operation that does not
 * depend on sign, and for division by zero.
 */
export function foldSigned(
  op: Instruction.BinaryOp["op"],
  left: bigint,
  right: bigint,
): bigint | boolean | undefined {
  const a = toSigned(left);
  const b = toSigned(right);

  switch (op) {
    case "lt":
      return a < b;
    case "le":
      return a <= b;
    case "gt":
      return a > b;
    case "ge":
      return a >= b;
    case "div":
      return b !== 0n ? toWord(a / b) : undefined;
    case "mod":
      return b !== 0n ? toWord(a % b) : undefined;
    default:
      return undefined;
  }
}

const toWord = (value: bigint): bigint => ((value % word) + word) % word;

const toSigned = (value: bigint): bigint => {
  const unsigned = toWord(value);
  return unsigned >= word / 2n ? unsigned - word : unsigned;
};
