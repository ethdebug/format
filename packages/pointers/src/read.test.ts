import { vitest, expect, describe, it, beforeEach } from "vitest";

import type { Pointer } from "@ethdebug/format";

import { Machine } from "./machine.js";
import { Data } from "./data.js";
import { read, type ReadOptions } from "./read.js";
import { Cursor } from "./cursor.js";

describe("read", () => {
  let options: ReadOptions;

  beforeEach(() => {
    const state: Machine.State = {
      stack: {
        length: 50n,
        peek: vitest.fn(
          async ({ depth, slice }) =>
            Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))
        ),
      },
      memory: {
        read: vitest.fn(
          async ({ slice }) =>
            Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))
        ),
      },
      storage: {
        read: vitest.fn(
          async ({ slot, slice }) =>
            Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))
        ),
      },
      calldata: {
        read: vitest.fn(
          async ({ slice }) =>
            Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))
        ),
      },
      returndata: {
        read: vitest.fn(
          async ({ slice }) =>
            Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))
        ),
      },
      transient: {
        read: vitest.fn(
          async ({ slot, slice }) =>
            Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))
        ),
      },
      code: {
        read: vitest.fn(
          async ({ slice }) =>
            Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))
        ),
      },
    } as unknown as Machine.State;

    options = {
      state
    };
  });

  it("reads data from stack", async () => {
    const region: Cursor.Region<Pointer.Region.Stack> = {
      location: "stack",
      slot: Data.fromNumber(42),
      offset: Data.fromNumber(1),
      length: Data.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.stack.peek)
      .toHaveBeenCalledWith({ depth: 42n, slice: { offset: 1n, length: 2n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("reads data from memory", async () => {
    const region: Cursor.Region<Pointer.Region.Memory> = {
      location: "memory",
      offset: Data.fromNumber(0),
      length: Data.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.memory.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])));
  });

  it("reads data from storage", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Data.fromNumber(0),
      offset: Data.fromNumber(2),
      length: Data.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.storage.read)
      .toHaveBeenCalledWith({
        slot: Data.fromNumber(0),
        slice: { offset: 2n, length: 2n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("reads data from calldata", async () => {
    const region: Cursor.Region<Pointer.Region.Calldata> = {
      location: "calldata",
      offset: Data.fromNumber(0),
      length: Data.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.calldata.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("reads data from returndata", async () => {
    const region: Cursor.Region<Pointer.Region.Returndata> = {
      location: "returndata",
      offset: Data.fromNumber(0),
      length: Data.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.returndata.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])));
  });

  it("reads data from transient", async () => {
    const region: Cursor.Region<Pointer.Region.Transient> = {
      location: "transient",
      slot: Data.fromNumber(42),
      offset: Data.fromNumber(1),
      length: Data.fromNumber(2),
    };

    const result = await read(region, options);

    expect(options.state.transient.read)
      .toHaveBeenCalledWith({
        slot: Data.fromNumber(42),
        slice: { offset: 1n, length: 2n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("reads data from code", async () => {
    const region: Cursor.Region<Pointer.Region.Code> = {
      location: "code",
      offset: Data.fromNumber(0),
      length: Data.fromNumber(4),
    };

    const result = await read(region, options);

    expect(options.state.code.read)
      .toHaveBeenCalledWith({
        slice: { offset: 0n, length: 4n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("uses default offset and length values for stack region", async () => {
    const region: Cursor.Region<Pointer.Region.Stack> = {
      location: "stack",
      slot: Data.fromNumber(42),
    };

    const result = await read(region, options);

    expect(options.state.stack.peek)
      .toHaveBeenCalledWith({
        depth: 42n,
        slice: { offset: 0n, length: 32n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("uses default offset and length values for storage region", async () => {
    const region: Cursor.Region<Pointer.Region.Storage> = {
      location: "storage",
      slot: Data.fromHex("0x1f"),
    };

    const result = await read(region, options);

    expect(options.state.storage.read)
      .toHaveBeenCalledWith({
        slot: Data.fromHex("0x1f"),
        slice: { offset: 0n, length: 32n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("uses default offset and length values for transient region", async () => {
    const region: Cursor.Region<Pointer.Region.Transient> = {
      location: "transient",
      slot: Data.fromNumber(42)
    };

    const result = await read(region, options);

    expect(options.state.transient.read)
      .toHaveBeenCalledWith({
        slot: Data.fromNumber(42),
        slice: { offset: 0n, length: 32n }
      });

    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });
});
