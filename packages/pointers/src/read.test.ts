import { vitest, expect, describe, it, beforeEach } from "vitest";

import type { Pointer } from "@ethdebug/format";

import { type Machine, Raw } from "@ethdebug/common";
import { read, type ReadOptions } from "./read.js";
import { Cursor } from "#cursor";

describe("read", () => {
  let options: ReadOptions;

  beforeEach(() => {
    const state: Machine.State = {
      stack: {
        length: 50n,
        peek: vitest.fn(
          async ({ depth: _depth, slice: _slice }) =>
            new Uint8Array([0x11, 0x22, 0x33, 0x44]),
        ),
      },
      memory: {
        read: vitest.fn(
          async ({ slice: _slice }) => new Uint8Array([0x55, 0x66, 0x77, 0x88]),
        ),
      },
      storage: {
        read: vitest.fn(
          async ({ slot: _slot, slice: _slice }) =>
            new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]),
        ),
      },
      calldata: {
        read: vitest.fn(
          async ({ slice: _slice }) => new Uint8Array([0x11, 0x22, 0x33, 0x44]),
        ),
      },
      returndata: {
        read: vitest.fn(
          async ({ slice: _slice }) => new Uint8Array([0x55, 0x66, 0x77, 0x88]),
        ),
      },
      transient: {
        read: vitest.fn(
          async ({ slot: _slot, slice: _slice }) =>
            new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]),
        ),
      },
      code: {
        read: vitest.fn(
          async ({ slice: _slice }) => new Uint8Array([0x11, 0x22, 0x33, 0x44]),
        ),
      },
    } as unknown as Machine.State;

    options = {
      state,
    };
  });

  it("reads data from stack", async () => {
    const region: Cursor.Region<Pointer.Region.Stack> = {
      location: "stack",
      slot: Raw.fromNumber(42),
      offset: Raw.fromNumber(1),
      length: Raw.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.stack.peek).toHaveBeenCalledWith({
      depth: 42n,
      slice: { offset: 1n, length: 2n },
    });
    expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
  });

  it("reads data from memory", async () => {
    const region: Cursor.Region<Pointer.Region.Memory> = {
      location: "memory",
      offset: Raw.fromNumber(0),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.memory.read).toHaveBeenCalledWith({
      slice: { offset: 0n, length: 4n },
    });
    expect(result).toEqual(new Uint8Array([0x55, 0x66, 0x77, 0x88]));
  });

  it("reads data from storage", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(2),
      length: Raw.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(0),
      slice: { offset: 2n, length: 2n },
    });

    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it("reads data from calldata", async () => {
    const region: Cursor.Region<Pointer.Region.Calldata> = {
      location: "calldata",
      offset: Raw.fromNumber(0),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.calldata.read).toHaveBeenCalledWith({
      slice: { offset: 0n, length: 4n },
    });
    expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
  });

  it("reads data from returndata", async () => {
    const region: Cursor.Region<Pointer.Region.Returndata> = {
      location: "returndata",
      offset: Raw.fromNumber(0),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.returndata.read).toHaveBeenCalledWith({
      slice: { offset: 0n, length: 4n },
    });
    expect(result).toEqual(new Uint8Array([0x55, 0x66, 0x77, 0x88]));
  });

  it("reads data from transient", async () => {
    const region: Cursor.Region<Pointer.Region.Transient> = {
      location: "transient",
      slot: Raw.fromNumber(42),
      offset: Raw.fromNumber(1),
      length: Raw.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.transient.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(42),
      slice: { offset: 1n, length: 2n },
    });

    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it("reads data from code", async () => {
    const region: Cursor.Region<Pointer.Region.Code> = {
      location: "code",
      offset: Raw.fromNumber(0),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.code.read).toHaveBeenCalledWith({
      slice: { offset: 0n, length: 4n },
    });

    expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
  });

  it("uses default offset and length values for stack region", async () => {
    const region: Cursor.Region<Pointer.Region.Stack> = {
      location: "stack",
      slot: Raw.fromNumber(42),
    };

    const result = await read(region, options);

    expect(options.state.stack.peek).toHaveBeenCalledWith({
      depth: 42n,
      slice: { offset: 0n, length: 32n },
    });

    expect(result).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0x44]));
  });

  it("uses default offset and length values for storage region", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromHex("0x1f"),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromHex("0x1f"),
      slice: { offset: 0n, length: 32n },
    });

    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });

  it("uses default offset and length values for transient region", async () => {
    const region: Cursor.Region<Pointer.Region.Transient> = {
      location: "transient",
      slot: Raw.fromNumber(42),
    };

    const result = await read(region, options);

    expect(options.state.transient.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(42),
      slice: { offset: 0n, length: 32n },
    });

    expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
  });
});

describe("read (segment carry)", () => {
  // each slot `n` holds 32 bytes, all equal to `0xa0 + n`, so that the
  // bytes of a result identify which slot(s) they came from
  const wordFor = (index: bigint): Uint8Array =>
    new Uint8Array(32).fill(0xa0 + Number(index));

  const sliced = (
    word: Uint8Array,
    slice: Machine.State.Slice | undefined,
  ): Raw =>
    slice
      ? word.slice(Number(slice.offset), Number(slice.offset + slice.length))
      : word;

  let options: ReadOptions;

  beforeEach(() => {
    const words: Machine.State.Words = {
      read: vitest.fn(async ({ slot, slice }) =>
        sliced(wordFor(Raw.asUint(slot)), slice),
      ),
    };

    const state: Machine.State = {
      stack: {
        length: 50n,
        peek: vitest.fn(async ({ depth, slice }) =>
          sliced(wordFor(depth), slice),
        ),
      },
      storage: words,
      transient: {
        read: vitest.fn(async ({ slot, slice }) =>
          sliced(wordFor(Raw.asUint(slot)), slice),
        ),
      },
    } as unknown as Machine.State;

    options = { state };
  });

  const bytes = (...runs: [number, number][]): Raw =>
    new Uint8Array(
      runs.flatMap(([byte, count]) => new Array(count).fill(byte)),
    );

  it("treats offset ~wordsize as byte 0 of the next slot", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(32),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledTimes(1);
    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(1),
      slice: { offset: 0n, length: 4n },
    });
    expect(result).toEqual(bytes([0xa1, 4]));
  });

  it("carries an offset beyond ~wordsize into a later slot", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(5),
      offset: Raw.fromNumber(40),
      length: Raw.fromNumber(8),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledTimes(1);
    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(6),
      slice: { offset: 8n, length: 8n },
    });
    expect(result).toEqual(bytes([0xa6, 8]));
  });

  it("concatenates a range that spans a slot boundary", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(28),
      length: Raw.fromNumber(8),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledTimes(2);
    expect(options.state.storage.read).toHaveBeenNthCalledWith(1, {
      slot: Raw.fromNumber(0),
      slice: { offset: 28n, length: 4n },
    });
    expect(options.state.storage.read).toHaveBeenNthCalledWith(2, {
      slot: Raw.fromNumber(1),
      slice: { offset: 0n, length: 4n },
    });
    expect(result).toEqual(bytes([0xa0, 4], [0xa1, 4]));
  });

  it("concatenates a range that spans three slots", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(16),
      length: Raw.fromNumber(64),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledTimes(3);
    expect(options.state.storage.read).toHaveBeenNthCalledWith(1, {
      slot: Raw.fromNumber(0),
      slice: { offset: 16n, length: 16n },
    });
    expect(options.state.storage.read).toHaveBeenNthCalledWith(2, {
      slot: Raw.fromNumber(1),
      slice: { offset: 0n, length: 32n },
    });
    expect(options.state.storage.read).toHaveBeenNthCalledWith(3, {
      slot: Raw.fromNumber(2),
      slice: { offset: 0n, length: 16n },
    });
    expect(result).toEqual(bytes([0xa0, 16], [0xa1, 32], [0xa2, 16]));
  });

  it("defaults length to the end of the slot it begins in", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(40),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledTimes(1);
    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromNumber(1),
      slice: { offset: 8n, length: 24n },
    });
    expect(result).toEqual(bytes([0xa1, 24]));
  });

  it("reads nothing for a zero-length segment", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(0),
      length: Raw.fromNumber(0),
    };

    const result = await read(region, options);

    expect(options.state.storage.read).not.toHaveBeenCalled();
    expect(result).toEqual(Raw.zero());
  });

  it("preserves the width of the given slot", async () => {
    const slot = Raw.fromHex(`0x${"00".repeat(31)}07`);
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot,
      offset: Raw.fromNumber(32),
      length: Raw.fromNumber(1),
    };

    await read(region, options);

    expect(options.state.storage.read).toHaveBeenCalledWith({
      slot: Raw.fromHex(`0x${"00".repeat(31)}08`),
      slice: { offset: 0n, length: 1n },
    });
  });

  it("applies carry to transient storage", async () => {
    const region: Cursor.Region<Pointer.Region.Transient> = {
      location: "transient",
      slot: Raw.fromNumber(0),
      offset: Raw.fromNumber(30),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.transient.read).toHaveBeenCalledTimes(2);
    expect(result).toEqual(bytes([0xa0, 2], [0xa1, 2]));
  });

  it("applies carry to stack depth", async () => {
    const region: Cursor.Region<Pointer.Region.Stack> = {
      location: "stack",
      slot: Raw.fromNumber(2),
      offset: Raw.fromNumber(30),
      length: Raw.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.stack.peek).toHaveBeenCalledTimes(2);
    expect(options.state.stack.peek).toHaveBeenNthCalledWith(1, {
      depth: 2n,
      slice: { offset: 30n, length: 2n },
    });
    expect(options.state.stack.peek).toHaveBeenNthCalledWith(2, {
      depth: 3n,
      slice: { offset: 0n, length: 2n },
    });
    expect(result).toEqual(bytes([0xa2, 2], [0xa3, 2]));
  });

  it("reads the fragment of a virtual region", async () => {
    const expression = Raw.fromHex("0xdeadbeef");

    expect(
      await read(
        {
          location: "virtual",
          expression,
          offset: Raw.fromNumber(1),
          length: Raw.fromNumber(2),
        },
        options,
      ),
    ).toEqual(Raw.fromHex("0xadbe"));
    expect(await read({ location: "virtual", expression }, options)).toEqual(
      expression,
    );
  });
});
