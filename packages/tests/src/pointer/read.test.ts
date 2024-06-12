import { jest, expect, describe, it, beforeEach } from "@jest/globals";
import { Machine } from "./machine.js";
import { Data } from "./data.js";
import { Pointer } from "./pointer.js";
import { read, type ReadOptions } from "./read.js";

describe("read", () => {
  let options: ReadOptions;

  beforeEach(() => {
    const machineMock: Machine = {
      stack: {
        peek: jest.fn(async ({ depth, slice }) => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
      memory: {
        read: jest.fn(async ({ slice }) => Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))),
      },
      storage: {
        read: jest.fn(async ({ slot, slice }) => Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))),
      },
      calldata: {
        read: jest.fn(async ({ slice }) => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
      returndata: {
        read: jest.fn(async ({ slice }) => Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))),
      },
      transient: {
        read: jest.fn(async ({ slot, slice }) => Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))),
      },
      code: {
        read: jest.fn(async ({ slice }) => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
    } as unknown as Machine;

    options = {
      machine: machineMock,
      variables: {
        foo: Data.fromNumber(42),
        bar: Data.fromHex("0x1f"),
      },
      regions: {},
    };
  });

  it("reads data from stack", async () => {
    const region: Pointer.Region.Stack = {
      location: "stack",
      slot: "foo",
      offset: 1,
      length: 2,
    };

    const result = await read(region, options);

    expect(options.machine.stack.peek)
      .toHaveBeenCalledWith({ depth: 42n, slice: { offset: 1n, length: 2n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("reads data from memory", async () => {
    const region: Pointer.Region.Memory = {
      location: "memory",
      offset: 0,
      length: 4,
    };

    const result = await read(region, options);

    expect(options.machine.memory.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])));
  });

  it("reads data from storage", async () => {
    const region: Pointer.Region.Storage = {
      location: "storage",
      slot: "bar",
      offset: 2,
      length: 2,
    };

    const result = await read(region, options);

    expect(options.machine.storage.read)
      .toHaveBeenCalledWith({
        slot: Data.fromHex("0x1f"),
        slice: { offset: 2n, length: 2n }
      });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("reads data from calldata", async () => {
    const region: Pointer.Region.Calldata = {
      location: "calldata",
      offset: 0,
      length: 4,
    };

    const result = await read(region, options);

    expect(options.machine.calldata.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("reads data from returndata", async () => {
    const region: Pointer.Region.Returndata = {
      location: "returndata",
      offset: 0,
      length: 4,
    };

    const result = await read(region, options);

    expect(options.machine.returndata.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])));
  });

  it("reads data from transient", async () => {
    const region: Pointer.Region.Transient = {
      location: "transient",
      slot: "foo",
      offset: 1,
      length: 2,
    };

    const result = await read(region, options);

    expect(options.machine.transient.read).toHaveBeenCalledWith({ slot: Data.fromNumber(42), slice: { offset: 1n, length: 2n } });
    expect(result).toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("reads data from code", async () => {
    const region: Pointer.Region.Code = {
      location: "code",
      offset: 0,
      length: 4,
    };

    const result = await read(region, options);

    expect(options.machine.code.read)
      .toHaveBeenCalledWith({ slice: { offset: 0n, length: 4n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("uses default offset and length values for stack region", async () => {
    const region: Pointer.Region.Stack = {
      location: "stack",
      slot: "foo",
    };

    const result = await read(region, options);

    expect(options.machine.stack.peek)
      .toHaveBeenCalledWith({ depth: 42n, slice: { offset: 0n, length: 32n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])));
  });

  it("uses default offset and length values for storage region", async () => {
    const region: Pointer.Region.Storage = {
      location: "storage",
      slot: "bar",
    };

    const result = await read(region, options);

    expect(options.machine.storage.read)
      .toHaveBeenCalledWith({ slot: Data.fromHex("0x1f"), slice: { offset: 0n, length: 32n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });

  it("uses default offset and length values for transient region", async () => {
    const region: Pointer.Region.Transient = {
      location: "transient",
      slot: "foo",
    };

    const result = await read(region, options);

    expect(options.machine.transient.read)
      .toHaveBeenCalledWith({ slot: Data.fromNumber(42), slice: { offset: 0n, length: 32n } });
    expect(result)
      .toEqual(Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])));
  });
});
