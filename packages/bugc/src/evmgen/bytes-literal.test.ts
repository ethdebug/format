import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

// 40 bytes, 0x01 to 0x28: too long for a bytesN, so `bytes`
const literal = Array.from({ length: 40 }, (_, i) =>
  (i + 1).toString(16).padStart(2, "0"),
).join("");

describe("a bytes literal", () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`should hold its bytes and length (level ${level})`, async () => {
      const source = `name BytesLiteral;
storage { [0] n: uint256; [1] head: bytes32; [2] tail: bytes32; }
code {
  let data: bytes = 0x${literal};
  n = data.length;
  head = data[0:32] as bytes32;
  tail = data[8:40] as bytes32;
}`;

      const result = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(40n);
      expect(await result.getStorage(1n)).toBe(
        BigInt("0x" + literal.slice(0, 64)),
      );
      expect(await result.getStorage(2n)).toBe(
        BigInt("0x" + literal.slice(16, 80)),
      );
    });
  }
});
