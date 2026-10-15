import { Type as BugType } from "#types";

import { Type } from "../spec/type.js";

/**
 * The bytes of a string constant of dynamic `bytes` or a `string`: a
 * `string` is its text, in UTF-8, and `bytes` (from a hex literal too
 * long for a word) are the bytes the "0x…" hex names. Code generation
 * stores these bytes, and constant folding hashes them.
 *
 * The encoding follows the constant's TYPE, so a fold of a string
 * constant across `as bytes` must re-encode its value ("0x" + hex of
 * the UTF-8), not only retype it.
 */
export function constantBytes(value: string, type: Type): Uint8Array {
  const isString =
    Type.isRef(type) &&
    type.origin !== "synthetic" &&
    BugType.isElementary(type.origin) &&
    BugType.Elementary.isString(type.origin);
  if (isString || !value.startsWith("0x")) {
    return new TextEncoder().encode(value);
  }

  const hex = value.slice(2);
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}
