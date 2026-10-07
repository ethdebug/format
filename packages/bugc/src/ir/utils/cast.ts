import { Type as BugType } from "#types";

import { Type } from "../spec/type.js";

/**
 * One step of a cast's code. Every scalar sits right-aligned in its
 * word, `bytesN` included: a value of `n` bytes is the word's low
 * `n` bytes, and the first byte of a `bytesN` is the highest of them.
 *
 * - `load`: replace a reference to dynamic `bytes` in memory or
 *   calldata (`from`) with its first 32 bytes, as a `bytes32` (bytes
 *   past the length are zero)
 * - `and`: keep the low `bytes` bytes
 * - `signextend`: sign-extend from the low `bytes` bytes
 * - `shr` / `shl`: shift by `bytes` bytes
 */
export type CastStep =
  | { op: "load"; from: "memory" | "calldata" }
  | { op: "and" | "signextend" | "shr" | "shl"; bytes: number };

type Kind = "unsigned" | "signed" | "bytes";

interface Shape {
  kind: Kind;
  size: number;
}

const shapeOf = (type: Type.Scalar): Shape => {
  const { origin, size } = type;
  if (origin !== "synthetic" && BugType.isElementary(origin)) {
    if (BugType.Elementary.isInt(origin)) {
      return { kind: "signed", size };
    }
    if (BugType.Elementary.isBytes(origin)) {
      return { kind: "bytes", size };
    }
  }
  return { kind: "unsigned", size };
};

/**
 * The steps that cast a value of type `from` to type `to`:
 *
 * - to `bytesN`: keep the leading bytes (narrowing), or pad with zero
 *   bytes at the end (widening)
 * - to an unsigned integer or `address`: keep the low bits
 * - to a signed integer: keep the low bits, then sign-extend
 * - from a signed integer to a wider type: sign-extend first
 * - from dynamic `bytes`: load its first 32 bytes as a `bytes32`, then
 *   cast that
 *
 * No steps means the cast emits no code.
 */
export function castSteps(from: Type, to: Type): CastStep[] {
  if (!Type.isScalar(to)) {
    return [];
  }

  if (!Type.isScalar(from)) {
    const loaded = Type.scalar(32, BugType.Elementary.bytes(32));
    return Type.isRef(from) &&
      (from.location === "memory" || from.location === "calldata")
      ? [{ op: "load", from: from.location }, ...castSteps(loaded, to)]
      : [];
  }

  const source = shapeOf(from);
  const target = shapeOf(to);
  const steps: CastStep[] = [];

  if (target.kind === "bytes") {
    if (source.size > target.size) {
      steps.push({ op: "shr", bytes: source.size - target.size });
    } else if (source.size < target.size) {
      steps.push({ op: "shl", bytes: target.size - source.size });
    }
    return steps;
  }

  // A signed value keeps its sign in a wider type
  if (source.kind === "signed" && source.size < target.size) {
    steps.push({ op: "signextend", bytes: source.size });
  }

  if (target.size < 32) {
    if (target.kind === "signed" && source.size >= target.size) {
      steps.push({ op: "signextend", bytes: target.size });
    } else if (
      target.kind !== "signed" &&
      (source.kind === "signed" || source.size > target.size)
    ) {
      steps.push({ op: "and", bytes: target.size });
    }
  }

  return steps;
}

const word = 2n ** 256n;

/**
 * Apply a cast's steps to a constant. Returns undefined for a cast
 * that loads from memory or calldata.
 */
export function foldCast(
  value: bigint,
  steps: readonly CastStep[],
): bigint | undefined {
  let result = ((value % word) + word) % word;

  for (const step of steps) {
    if (step.op === "load") {
      return undefined;
    }

    const bits = BigInt(step.bytes * 8);
    switch (step.op) {
      case "and":
        result &= (1n << bits) - 1n;
        break;
      case "signextend": {
        const low = result & ((1n << bits) - 1n);
        result = low >> (bits - 1n) ? word - (1n << bits) + low : low;
        break;
      }
      case "shr":
        result >>= bits;
        break;
      case "shl":
        result = (result << bits) % word;
        break;
    }
  }

  return result;
}
