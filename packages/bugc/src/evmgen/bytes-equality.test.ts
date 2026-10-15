import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

const levels = [0, 1, 2, 3] as const;

const word = (n: number) => n.toString(16).padStart(64, "0");
const hex = (s: string) => Buffer.from(s).toString("hex");

/** Calldata: the two lengths, then the two byte strings */
const calldata = (a: string, b: string) =>
  word(a.length) + word(b.length) + hex(a) + hex(b);

/**
 * Two byte strings from the calldata, each copied to its own place in
 * memory, compared as `bytes` and as `string`, with a literal, and
 * with a string in storage
 */
const source = `name Equality;
storage {
  [0] eq: bool; [1] ne: bool; [2] seq: bool; [3] sne: bool;
  [4] lit: bool; [5] stored: string; [6] seqs: bool;
}
code {
  let la = msg.data[0:32] as bytes32 as uint256;
  let lb = msg.data[32:64] as bytes32 as uint256;
  let a: bytes = msg.data[64:64 + la];
  let b: bytes = msg.data[64 + la:64 + la + lb];
  eq = a == b;
  ne = a != b;
  let x = a as string;
  let y = b as string;
  seq = x == y;
  sne = x != y;
  lit = x == "abc";
  stored = x;
  seqs = stored == y;
}`;

const cases: [string, string, string][] = [
  ["equal", "abc", "abc"],
  ["unequal, same length", "abc", "abd"],
  ["different lengths", "abc", "abcd"],
  ["empty", "", ""],
  ["empty and not", "", "a"],
  ["equal, 32 bytes", "a".repeat(32), "a".repeat(32)],
  ["equal, 33 bytes", "a".repeat(33), "a".repeat(33)],
  ["unequal past 32 bytes", "a".repeat(33), "a".repeat(32) + "b"],
  ["32 and 33 bytes", "a".repeat(32), "a".repeat(33)],
  ["unequal in the first byte, 64", "b" + "a".repeat(63), "a".repeat(64)],
];

describe("== and != on bytes and string compare contents", () => {
  for (const level of levels) {
    describe(`at O${level}`, () => {
      for (const [name, a, b] of cases) {
        it(name, async () => {
          const result = await executeProgram(source, {
            calldata: calldata(a, b),
            optimizationLevel: level,
          });
          expect(result.callSuccess).toBe(true);
          const equal = BigInt(a === b);
          expect(await result.getStorage(0n)).toBe(equal);
          expect(await result.getStorage(1n)).toBe(1n - equal);
          expect(await result.getStorage(2n)).toBe(equal);
          expect(await result.getStorage(3n)).toBe(1n - equal);
          expect(await result.getStorage(4n)).toBe(BigInt(a === "abc"));
          expect(await result.getStorage(6n)).toBe(equal);
        });
      }
    });
  }
});
