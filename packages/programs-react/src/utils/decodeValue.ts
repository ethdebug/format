/**
 * Display-only value decoding for the trace views. It turns the bytes of
 * a local's value region into a readable string, by the local's type.
 *
 * bugc's pointers name exactly a scalar's bytes (an address is 20 bytes,
 * a bool is 1 byte), so this decodes the region as given. Kinds other
 * than uint, int, bool and address show as hex.
 */
import { keccak256 } from "ethereum-cryptography/keccak";
import type { Data } from "@ethdebug/pointers";

export function decodeValue(data: Data, type: unknown): string {
  const kind = (type as { kind?: unknown } | undefined)?.kind;
  switch (kind) {
    case "uint":
      return data.asUint().toString(10);
    case "int":
      return decodeInt(data);
    case "bool":
      return data.asUint() === 0n ? "false" : "true";
    case "address":
      return checksum(data.resizeTo(20).toHex().slice(2));
    default:
      return data.toHex();
  }
}

/** Two's complement over the region's byte width. */
function decodeInt(data: Data): string {
  if (data.length === 0) return "0";
  const bits = BigInt(data.length * 8);
  const raw = data.asUint();
  const value = raw >= 1n << (bits - 1n) ? raw - (1n << bits) : raw;
  return value.toString(10);
}

/** EIP-55 checksum of a lowercase hex address (no `0x`). */
function checksum(lowerHex: string): string {
  const hash = keccak256(new TextEncoder().encode(lowerHex));
  let out = "0x";
  for (let i = 0; i < lowerHex.length; i++) {
    const nibble = i % 2 === 0 ? hash[i >> 1] >> 4 : hash[i >> 1] & 0x0f;
    out += nibble >= 8 ? lowerHex[i].toUpperCase() : lowerHex[i];
  }
  return out;
}
