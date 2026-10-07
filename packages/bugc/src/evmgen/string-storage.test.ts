import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import {
  executeProgram,
  type ExecuteProgramResult,
} from "#test/evm/behavioral";

const lengths = [0, 5, 31, 32, 70];
const levels = [0, 1, 2, 3] as const;

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const text = (length: number) =>
  Array.from({ length }, (_, i) => alphabet[i % alphabet.length]).join("");

const hex = (length: number) =>
  Array.from({ length }, (_, i) => (i + 1).toString(16).padStart(2, "0")).join(
    "",
  );

const word = (n: bigint) => hexToBytes(n.toString(16).padStart(64, "0"));
const hash = (bytes: Uint8Array) => BigInt("0x" + bytesToHex(keccak256(bytes)));

/** The slot of a mapping's value: keccak256(key . slot) */
const mappingSlot = (slot: bigint, key: bigint) =>
  hash(new Uint8Array([...word(key), ...word(slot)]));

/**
 * Check that storage at `slot` holds `data` as Solidity encodes a
 * string or `bytes`: up to 31 bytes in the slot itself, left-aligned,
 * with length * 2 in the low byte; else length * 2 + 1 in the slot and
 * the data from keccak256(slot).
 */
async function expectEncoded(
  result: ExecuteProgramResult,
  slot: bigint,
  data: Uint8Array,
) {
  const length = BigInt(data.length);
  const padded = new Uint8Array(Math.ceil(data.length / 32) * 32);
  padded.set(data);
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

describe("assigning a memory string to storage", () => {
  for (const level of levels) {
    for (const length of lengths) {
      it(`stores ${length} bytes (level ${level})`, async () => {
        const value = text(length);
        const source = `name StringToStorage;
storage { [0] s: string; [1] t: string; [2] u: mapping<uint256, string>; }
code {
  let m: string = "${value}";
  s = m;
  t = "${value}";
  u[7] = m;
}`;

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        const data = new TextEncoder().encode(value);
        await expectEncoded(result, 0n, data);
        await expectEncoded(result, 1n, data);
        await expectEncoded(result, mappingSlot(2n, 7n), data);
      });
    }
  }
});

describe("assigning memory bytes to storage", () => {
  // Slices of a 70-byte literal. Memory past the end of a slice's
  // data may hold other bytes; those must not reach storage.
  for (const level of levels) {
    for (const length of lengths) {
      it(`stores ${length} bytes (level ${level})`, async () => {
        const source = `name BytesToStorage;
storage { [0] b: bytes; }
code {
  let m: bytes = 0x${hex(70)};
  ${length === 70 ? "b = m;" : `b = m[0:${length}];`}
}`;

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        await expectEncoded(result, 0n, hexToBytes(hex(length)));
      });
    }
  }
});

describe("assigning a shorter value to a storage string", () => {
  // Old and new lengths. As Solidity does, a new value that needs fewer
  // data words than the old one zeroes the old words it no longer uses
  const changes: Array<[number, number]> = [
    [50, 5],
    [70, 40],
    [70, 32],
    [40, 0],
    [70, 31],
    [5, 70],
    [40, 70],
    [70, 70],
    [5, 3],
  ];

  for (const level of levels) {
    for (const [from, to] of changes) {
      it(`stores ${to} bytes over ${from} (level ${level})`, async () => {
        const source = `name StringShrink;
storage { [0] s: string; [1] b: bytes; }
create {
  s = "${text(from)}";
  let n: bytes = 0x${hex(70)};
  b = ${from === 70 ? "n" : `n[0:${from}]`};
}
code {
  let m: string = "${text(to)}";
  s = m;
  let n: bytes = 0x${hex(70)};
  b = ${to === 70 ? "n" : `n[0:${to}]`};
}`;

        const before = await executeProgram(source, {
          optimizationLevel: level,
        });
        await expectEncoded(before, 0n, new TextEncoder().encode(text(from)));
        await expectEncoded(before, 1n, hexToBytes(hex(from)));

        const after = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(after.callSuccess).toBe(true);
        await expectEncoded(after, 0n, new TextEncoder().encode(text(to)));
        await expectEncoded(after, 1n, hexToBytes(hex(to)));

        // Every data word past the new value's is zero
        const used = (length: number) =>
          length < 32 ? 0 : Math.ceil(length / 32);
        for (const slot of [0n, 1n]) {
          const base = hash(word(slot));
          for (let i = used(to); i < used(from); i++) {
            expect(await after.getStorage(base + BigInt(i))).toBe(0n);
          }
        }
      });
    }
  }
});
