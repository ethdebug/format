import { expect, describe, it } from "vitest";

import type { Pointer } from "@ethdebug/format";
import { schemas } from "@ethdebug/format";

import type { Machine } from "#machine";
import { Data } from "#data";
import { dereference } from "./dereference/index.js";

const { examples } = schemas[
  "schema:ethdebug/format/pointer/scheme/segment"
] as {
  examples: Record<string, unknown>[];
};

// the packed examples all address slot 2
const packed = examples.filter((example) => example.slot === 2);

// slot 2 packs an address (bytes 12 to 31) and a uint32 (bytes 8 to 11); a
// byte's number counts from the most significant end of the word
const address = Uint8Array.from({ length: 20 }, (_, i) => 0xa0 + i);
const count = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
const word = new Uint8Array(32);
word.set(address, 12);
word.set(count, 8);

const state = {
  stack: { length: Promise.resolve(0n) },
  storage: {
    read: async ({
      slot,
      slice,
    }: {
      slot: Data;
      slice?: Machine.State.Slice;
    }) => {
      expect(slot).toEqual(Data.fromNumber(2));
      return Data.fromBytes(
        slice
          ? word.slice(
              Number(slice.offset),
              Number(slice.offset + slice.length),
            )
          : word,
      );
    },
  },
} as unknown as Machine.State;

async function resolve(example: Record<string, unknown>): Promise<Data> {
  const pointer = { location: "storage", ...example } as Pointer;
  const cursor = await dereference(pointer);
  const { regions, read } = await cursor.view(state);
  return read(regions[0]);
}

describe("segment schema examples (packed)", () => {
  it("include literal and expression offsets", () => {
    expect(packed.map((example) => example.offset)).toEqual([
      12,
      8,
      {
        $difference: ["$wordsize", { ".length": "$this" }],
      },
      {
        $difference: ["$wordsize", { $sum: [20, { ".length": "$this" }] }],
      },
    ]);
  });

  it("count offsets from the most significant byte", async () => {
    const [literalAddress, literalCount] = packed;

    expect(await resolve(literalAddress)).toEqual(Data.fromBytes(address));
    expect(await resolve(literalCount)).toEqual(Data.fromBytes(count));
    expect(await resolve({ slot: 2, offset: 0, length: 1 })).toEqual(
      Data.fromBytes(new Uint8Array([0x00])),
    );
  });

  it("resolve each expression like its literal twin", async () => {
    const [literalAddress, literalCount, exprAddress, exprCount] = packed;

    expect(await resolve(exprAddress)).toEqual(await resolve(literalAddress));
    expect(await resolve(exprCount)).toEqual(await resolve(literalCount));
  });
});
