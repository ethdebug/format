import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import { executeProgram } from "#test/evm/behavioral";

const levels = [0, 1, 2, 3] as const;

const word = (n: bigint) => n.toString(16).padStart(64, "0");

/** Calldata for `setMotd(string)`, ABI-encoded, without the 0x */
function setMotd(text: string): string {
  const data = Buffer.from(text).toString("hex");
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  return "deadbeef" + word(32n) + word(BigInt(text.length)) + padded;
}

/** The slot of `out[i]`, with `[3] out: mapping<uint256, uint256>` */
const outSlot = (i: number) =>
  BigInt("0x" + bytesToHex(keccak256(hexToBytes(word(BigInt(i)) + word(3n)))));

/** A string's slot as Solidity stores it, and its data slots */
function stored(text: string, slot: bigint): Map<bigint, bigint> {
  const bytes = Buffer.from(text);
  const slots = new Map<bigint, bigint>();
  if (bytes.length < 32) {
    const data = Buffer.alloc(32);
    bytes.copy(data);
    data[31] = bytes.length * 2;
    slots.set(slot, BigInt("0x" + data.toString("hex")));
    return slots;
  }
  slots.set(slot, BigInt(bytes.length * 2 + 1));
  const base = BigInt("0x" + bytesToHex(keccak256(hexToBytes(word(slot)))));
  for (let i = 0; i * 32 < bytes.length; i++) {
    const data = Buffer.alloc(32);
    bytes.copy(data, 0, i * 32, i * 32 + 32);
    slots.set(base + BigInt(i), BigInt("0x" + data.toString("hex")));
  }
  return slots;
}

// The text's bounds come from its ABI offset and length words
const decode = `
  let offset = msg.data[4:36] as bytes32 as uint256;
  let n = msg.data[4 + offset:36 + offset] as bytes32 as uint256;
  let text = msg.data[36 + offset:36 + offset + n];`;

const texts = [
  "",
  "hello",
  "a".repeat(31),
  "b".repeat(32),
  "the quick brown fox jumps over the lazy dog, twice",
];

describe.each(levels)("a slice of calldata at O%i", (level) => {
  for (const text of texts) {
    const label = `${text.length} bytes`;

    it(`reads its length and bytes from calldata, ${label}`, async () => {
      const result = await executeProgram(
        `name Read;
storage {
  [0] motd: string; [1] len: uint256; [3] out: mapping<uint256, uint256>;
}
code {${decode}
  len = text.length;
  for (let i = 0; i < text.length; i = i + 1) {
    out[i] = text[i];
  }
}`,
        { calldata: setMotd(text), optimizationLevel: level },
      );
      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(1n)).toBe(BigInt(text.length));
      for (let i = 0; i < text.length; i++) {
        expect(await result.getStorage(outSlot(i)), `byte ${i}`).toBe(
          BigInt(text.charCodeAt(i)),
        );
      }
    });

    it(`stores its bytes to storage, ${label}`, async () => {
      const result = await executeProgram(
        `name Store;
storage { [0] motd: string; [1] raw: bytes; }
code {${decode}
  motd = text as string;
  raw = text;
}`,
        { calldata: setMotd(text), optimizationLevel: level },
      );
      expect(result.callSuccess).toBe(true);
      for (const slot of [0n, 1n]) {
        for (const [at, value] of stored(text, slot)) {
          expect(await result.getStorage(at), `slot ${at}`).toBe(value);
        }
      }
    });
  }

  it("copies to a memory local, a cast and a parameter", async () => {
    const text = "the quick brown fox jumps over the lazy dog, twice";
    const result = await executeProgram(
      `name Copy;
define {
  function sum(b: bytes) -> uint256 {
    let total = 0;
    for (let i = 0; i < b.length; i = i + 1) {
      total = total + b[i];
    }
    return total;
  };
}
storage {
  [0] motd: string; [1] len: uint256; [2] total: uint256;
  [3] out: mapping<uint256, uint256>;
}
code {${decode}
  let m: bytes = text;
  m[0] = 88;
  len = m.length;
  let c = text as bytes;
  c[1] = 89;
  out[0] = m[0];
  out[1] = text[0];
  out[2] = c[1];
  out[3] = text[1];
  total = sum(text);
}`,
      { calldata: setMotd(text), optimizationLevel: level },
    );
    expect(result.callSuccess).toBe(true);
    expect(await result.getStorage(1n)).toBe(BigInt(text.length));
    expect(await result.getStorage(outSlot(0))).toBe(0x58n);
    expect(await result.getStorage(outSlot(1))).toBe(
      BigInt(text.charCodeAt(0)),
    );
    expect(await result.getStorage(outSlot(2))).toBe(89n);
    expect(await result.getStorage(outSlot(3))).toBe(
      BigInt(text.charCodeAt(1)),
    );
    expect(await result.getStorage(2n)).toBe(
      [...Buffer.from(text)].reduce((a, b) => a + BigInt(b), 0n),
    );
  });

  it("slices a slice, and casts one to bytesN", async () => {
    const result = await executeProgram(
      `name SliceCast;
storage {
  [0] a: bytes32; [1] b: bytes4; [2] c: uint256;
  [3] out: mapping<uint256, uint256>;
}
code {
  let all = msg.data[2:msg.data.length];
  let part = all[1:4];
  a = part as bytes32;
  b = msg.data[0:4] as bytes4;
  c = part.length;
  out[0] = part[0];
  out[1] = part[2];
}`,
      { calldata: "0102030405060708", optimizationLevel: level },
    );
    expect(result.callSuccess).toBe(true);
    // Bytes past the slice's length are zero
    expect(await result.getStorage(0n)).toBe(0x040506n << 232n);
    expect(await result.getStorage(1n)).toBe(0x01020304n);
    expect(await result.getStorage(2n)).toBe(3n);
    expect(await result.getStorage(outSlot(0))).toBe(4n);
    expect(await result.getStorage(outSlot(1))).toBe(6n);
  });

  it("reverts on an index or slice past the end", async () => {
    for (const access of ["text[5]", "text[2:6].length", "text[3:2].length"]) {
      const result = await executeProgram(
        `name Bounds;
storage { [1] len: uint256; }
code {${decode}
  len = ${access};
}`,
        { calldata: setMotd("hello"), optimizationLevel: level },
      );
      expect(result.callSuccess, access).toBe(false);
    }
  });
});
