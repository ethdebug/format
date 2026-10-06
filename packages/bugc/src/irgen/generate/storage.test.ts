import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import { executeProgram } from "#test/evm/behavioral";

const word = (n: bigint) => n.toString(16).padStart(64, "0");

// slot of `m[key]` for a mapping at `slot`
const mappingSlot = (key: bigint, slot: bigint) =>
  BigInt("0x" + bytesToHex(keccak256(hexToBytes(word(key) + word(slot)))));

const source = `name StructSlots;

define {
  struct Inner { p: uint256; q: uint256; };
  struct Outer { a: uint256; b: uint256; c: uint256; inner: Inner; };
}

storage {
  [5] s: Outer;
  [20] sum: uint256;
  [30] m: mapping<uint256, Outer>;
}

code {
  s.a = 1;
  s.b = 2;
  s.c = 3;
  s.inner.p = 4;
  s.inner.q = 5;
  m[7].c = 6;
  m[7].inner.q = 7;
  sum = s.b + s.c + s.inner.q + m[7].c + m[7].inner.q;
}
`;

describe("storage struct fields", () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`writes and reads each field in its own slot at O${level}`, async () => {
      const result = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(result.callSuccess).toBe(true);

      const slots = [5n, 6n, 7n, 8n, 9n].map(result.getStorage);
      expect(await Promise.all(slots)).toEqual([1n, 2n, 3n, 4n, 5n]);

      const base = mappingSlot(7n, 30n);
      expect(await result.getStorage(base + 2n)).toBe(6n);
      expect(await result.getStorage(base + 4n)).toBe(7n);

      expect(await result.getStorage(20n)).toBe(2n + 3n + 5n + 6n + 7n);
    });
  }
});
