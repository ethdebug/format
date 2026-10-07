import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import {
  executeProgram,
  type ExecuteProgramResult,
} from "#test/evm/behavioral";

const lengths = [0, 31, 32, 33, 100];
const levels = [0, 1, 2, 3] as const;

// 101 distinct bytes, 0x01 to 0x65
const source = Array.from({ length: 101 }, (_, i) =>
  (i + 1).toString(16).padStart(2, "0"),
).join("");

const word = (n: bigint) => hexToBytes(n.toString(16).padStart(64, "0"));

/** Storage `[1] out: mapping<uint256, uint256>` at key `i` */
const outSlot = (i: number) =>
  BigInt(
    "0x" +
      bytesToHex(keccak256(new Uint8Array([...word(BigInt(i)), ...word(1n)]))),
  );

/**
 * The program copies a slice's length to slot 0, and its bytes, one by
 * one, to `out`
 */
const copyOut = (slice: string) => `
  let x = ${slice};
  n = x.length;
  for (let i = 0; i < x.length; i = i + 1) {
    out[i] = x[i];
  }`;

async function expectBytes(result: ExecuteProgramResult, expected: string) {
  expect(result.callSuccess).toBe(true);
  const bytes = hexToBytes(expected);
  expect(await result.getStorage(0n)).toBe(BigInt(bytes.length));
  for (let i = 0; i < bytes.length; i++) {
    expect(await result.getStorage(outSlot(i)), `byte ${i}`).toBe(
      BigInt(bytes[i]),
    );
  }
}

describe("a slice copies all its bytes", () => {
  for (const level of levels) {
    for (const length of lengths) {
      it(`of msg.data, ${length} bytes (level ${level})`, async () => {
        const result = await executeProgram(
          `name CalldataSlice;
storage { [0] n: uint256; [1] out: mapping<uint256, uint256>; }
code {${copyOut("msg.data[1:msg.data.length]")}
}`,
          {
            calldata: source.slice(0, (length + 1) * 2),
            optimizationLevel: level,
          },
        );

        await expectBytes(result, source.slice(2, (length + 1) * 2));
      });

      it(`of memory bytes, ${length} bytes (level ${level})`, async () => {
        const result = await executeProgram(
          `name MemorySlice;
storage { [0] n: uint256; [1] out: mapping<uint256, uint256>; }
code {
  let m: bytes = 0x${source};${copyOut(`m[1:${length + 1}]`)}
}`,
          { calldata: "", optimizationLevel: level },
        );

        await expectBytes(result, source.slice(2, (length + 1) * 2));
      });
    }
  }
});
