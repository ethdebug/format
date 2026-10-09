/**
 * Support for tests of values in storage: test data, slots, and
 * Solidity's encoding of a string or `bytes`
 */
import { expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import type { ExecuteProgramResult } from "./behavioral.js";

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `length` characters of test text, from the `from`th of the alphabet */
export const text = (length: number, from: number = 0) =>
  Array.from({ length }, (_, i) => alphabet[(i + from) % alphabet.length]).join(
    "",
  );

/** `length` bytes of test data (1, 2, 3, ...), as hex without 0x */
export const hex = (length: number) =>
  Array.from({ length }, (_, i) => (i + 1).toString(16).padStart(2, "0")).join(
    "",
  );

/** A number as a 32-byte word */
export const word = (n: bigint) => hexToBytes(n.toString(16).padStart(64, "0"));

/** keccak256 of bytes, as a number */
export const hash = (bytes: Uint8Array) =>
  BigInt("0x" + bytesToHex(keccak256(bytes)));

/** The slot of a mapping's value: keccak256(key . slot) */
export const mappingSlot = (slot: bigint, key: bigint) =>
  hash(new Uint8Array([...word(key), ...word(slot)]));

/**
 * Check that storage at `slot` holds `data` (text, or bytes) as
 * Solidity encodes a string or `bytes`: up to 31 bytes in the slot
 * itself, left-aligned, with length * 2 in the low byte; else
 * length * 2 + 1 in the slot and the data from keccak256(slot).
 */
export async function expectEncoded(
  result: ExecuteProgramResult,
  slot: bigint,
  data: Uint8Array | string,
) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const length = BigInt(bytes.length);
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  const dataWord = (i: number) =>
    BigInt("0x" + (bytesToHex(padded.slice(i * 32, i * 32 + 32)) || "0"));

  if (length < 32n) {
    expect(await result.getStorage(slot)).toBe(dataWord(0) | (length * 2n));
    return;
  }

  expect(await result.getStorage(slot)).toBe(length * 2n + 1n);
  const base = hash(word(slot));
  for (let i = 0; i < padded.length / 32; i++) {
    expect(await result.getStorage(base + BigInt(i))).toBe(dataWord(i));
  }
}
