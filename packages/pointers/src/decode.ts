import { keccak256 } from "ethereum-cryptography/keccak";

import { Data } from "#data";

// Type is imported for its shape only; @ethdebug/format is a type-only
// (dev) dependency here, so we discriminate on `kind` structurally rather
// than pulling in the package's runtime type guards.
import type { Type } from "@ethdebug/format";

/**
 * Decode a resolved value region's bytes into a readable, human-facing
 * string, directed by the variable's static type.
 *
 * This is the scalar-first slice of the value-rendering `reduce` layer: it
 * turns raw bytes + type into a value a person can read (`uint256` -> `2`,
 * not `0x00...02`). It is a pure, framework-agnostic, byte-testable function
 * — no machine state, no location logic (the pointer layer already erased
 * that).
 *
 * Scalar kinds handled: `uint`, `int`, `bool`, `address`, static `bytes<N>`.
 * Everything else — dynamic `bytes`/`string`, arrays, structs, mappings,
 * `fixed`/`ufixed`, `enum`, unresolved `{ id }` type references, or a missing
 * type — falls back to raw hex so callers never break on an unhandled shape.
 */
export function decodeValue(
  data: Data,
  type: Type.Specifier | undefined,
): string {
  // No type, or a bare `{ id }` reference we can't resolve here -> raw hex.
  if (!type || typeof type !== "object" || !("kind" in type)) {
    return data.toHex();
  }

  switch (type.kind) {
    case "uint":
      return decodeUint(data);

    case "bool":
      return decodeBool(data);

    case "address":
      return decodeAddress(data);

    case "int":
      return decodeInt(data);

    case "bytes":
      // `size` present -> static `bytes<N>`; absent -> dynamic (deferred).
      return "size" in type && typeof type.size === "number"
        ? decodeBytesN(data, type.size)
        : data.toHex();

    default:
      // string, arrays, structs, mappings, fixed/ufixed, enum, contract, ...
      return data.toHex();
  }
}

function decodeUint(data: Data): string {
  return data.asUint().toString(10);
}

function decodeBool(data: Data): string {
  return data.asUint() === 0n ? "false" : "true";
}

/**
 * Two's-complement decode over the region's *actual* byte width. Signed
 * values are sign-extended to the region width by the compiler, so
 * interpreting over `data.length` bytes is correct whether the value is
 * stored tightly (`int8` in 1 byte) or in a full sign-extended word
 * (`int8` -1 as `0xff..ff`).
 */
function decodeInt(data: Data): string {
  const width = data.length;
  if (width === 0) {
    return "0";
  }

  const raw = data.asUint();
  const bits = BigInt(width * 8);
  const signBit = 1n << (bits - 1n);

  const value = raw >= signBit ? raw - (1n << bits) : raw;
  return value.toString(10);
}

/**
 * Address = the low 20 bytes, rendered as an EIP-55 checksummed `0x` string.
 * `resizeTo(20)` keeps the least-significant 20 bytes of a wider word (and
 * left-pads a narrower one).
 */
function decodeAddress(data: Data): string {
  const hex = data.resizeTo(20).toHex().slice(2);
  return toChecksumAddress(hex);
}

/**
 * Static `bytes<N>` is left-aligned (high-order) in its word, so the value is
 * the first `size` bytes of the region.
 */
function decodeBytesN(data: Data, size: number): string {
  return Data.fromBytes(data.slice(0, size)).toHex();
}

/**
 * EIP-55 checksum: hash the lowercase hex (ASCII, no `0x`), then uppercase
 * each hex letter whose corresponding hash nibble is >= 8.
 */
function toChecksumAddress(lowerHex: string): string {
  const hash = keccak256(new TextEncoder().encode(lowerHex));

  let out = "0x";
  for (let i = 0; i < lowerHex.length; i++) {
    const char = lowerHex[i];
    if (char >= "a" && char <= "f") {
      const hashByte = hash[i >> 1];
      const nibble = i % 2 === 0 ? hashByte >> 4 : hashByte & 0x0f;
      out += nibble >= 8 ? char.toUpperCase() : char;
    } else {
      out += char;
    }
  }
  return out;
}
