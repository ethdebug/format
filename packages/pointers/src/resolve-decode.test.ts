import { expect, describe, it } from "vitest";

import type { Machine } from "#machine";
import { Data } from "./data.js";
import { dereference } from "./dereference/index.js";
import { decodeValue } from "./decode.js";

// A minimal memory-backed Machine.State: `read` slices a backing buffer, so
// frame-relative resolution ($read the frame pointer, $sum an offset, read the
// value word) exercises the real dereference + read path.
function memoryState(memory: Uint8Array): Machine.State {
  return {
    // stack is unused by memory pointers but the view path reads its length
    stack: { length: Promise.resolve(0n) },
    memory: {
      read: async ({
        slice: { offset, length },
      }: {
        slice: { offset: bigint; length: bigint };
      }) => {
        const start = Number(offset);
        return Data.fromBytes(memory.slice(start, start + Number(length)));
      },
    },
  } as unknown as Machine.State;
}

// EIP-55 vector used across the decode tests.
const ADDRESS_HEX = "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const ADDRESS_CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

// Lay out a frame + a value word in memory:
//   mem[0x80 .. 0xa0)  = frame pointer value (FP), right-aligned
//   mem[FP+0x40 .. +0x20) = the value word (right-aligned scalar)
function layout(fp: number, valueWord: Uint8Array): Uint8Array {
  const memory = new Uint8Array(fp + 0x40 + 0x20);
  memory.set(Data.fromUint(BigInt(fp)).padUntilAtLeast(32), 0x80);
  memory.set(valueWord, fp + 0x40);
  return memory;
}

// A right-aligned scalar word (numbers/address sit in the LOW bytes).
const rightAlignedWord = (valueHexNo0x: string): Uint8Array =>
  Data.fromHex(`0x${valueHexNo0x.padStart(64, "0")}`);

// The sole-occupant value pointer: a frame region + a length-32 value region
// at FP + delta. This is the shape the compiler emits for a scalar that solely
// occupies its frame word (Option A: whole word, decode extracts by type).
const valuePointer = (name: string, delta: number) => ({
  group: [
    { name: "frame", location: "memory", offset: 0x80, length: 0x20 },
    {
      name,
      location: "memory",
      offset: { $sum: [{ $read: "frame" }, delta] },
      length: 0x20,
    },
  ],
});

async function resolveAndDecode(
  pointer: unknown,
  name: string,
  type: unknown,
  memory: Uint8Array,
): Promise<string> {
  const state = memoryState(memory);
  const cursor = await dereference(pointer as never);
  const view = await cursor.view(state);
  const region = view.regions.lookup[name];
  return decodeValue(await view.read(region), type as never);
}

describe("resolve -> decode (sole-occupant scalar contract)", () => {
  it("decodes a frame-relative address from a length-32 value word", async () => {
    // address right-aligned in its own 32-byte frame word
    const memory = layout(0x200, rightAlignedWord(ADDRESS_HEX));

    const value = await resolveAndDecode(
      valuePointer("ad", 0x40),
      "ad",
      { kind: "address" },
      memory,
    );

    expect(value).toBe(ADDRESS_CHECKSUMMED);
  });

  it("decodes a frame-relative uint256 from its value word", async () => {
    const memory = layout(0x200, rightAlignedWord("2a")); // 42

    const value = await resolveAndDecode(
      valuePointer("n", 0x40),
      "n",
      { kind: "uint", bits: 256 },
      memory,
    );

    expect(value).toBe("42");
  });

  it("shows why length must be 32: a length-20 region at the word top mis-reads the value", async () => {
    // Same address word, but a buggy value region of length 20 at the word TOP
    // (offset FP+0x40) captures the 12 high pad-zeros + first 8 address bytes.
    const memory = layout(0x200, rightAlignedWord(ADDRESS_HEX));
    const buggyPointer = {
      group: [
        { name: "frame", location: "memory", offset: 0x80, length: 0x20 },
        {
          name: "ad",
          location: "memory",
          offset: { $sum: [{ $read: "frame" }, 0x40] },
          length: 20,
        },
      ],
    };

    const value = await resolveAndDecode(
      buggyPointer,
      "ad",
      { kind: "address" },
      memory,
    );

    // A length-20 window at the word TOP captures the high pad bytes, not the
    // right-aligned value, so it never yields the real address. (For a
    // mostly-zero address the high bytes are all pad -> the reported all-zero
    // read; for a general address it is simply wrong.) This is exactly the bug
    // the length-32 + sole-occupant fix corrects.
    expect(value).not.toBe(ADDRESS_CHECKSUMMED);
  });
});
