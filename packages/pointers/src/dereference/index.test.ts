import { vitest, expect, describe, it, beforeEach } from "vitest";
import { Pointer } from "@ethdebug/format";
import { Machine } from "../machine.js";
import { Data } from "../data.js";
import { dereference } from "./index.js";

describe("dereference", () => {
  let state: Machine.State;

  beforeEach(() => {
    state = {
      stack: {
        length: Promise.resolve(10n),
        peek: vitest.fn(async () => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
      memory: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))),
      },
      storage: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))),
      },
      calldata: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
      returndata: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88]))),
      },
      transient: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))),
      },
      code: {
        read: vitest.fn(async () => Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44]))),
      },
    } as unknown as Machine.State;
  });

  it("works for a single region", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: {
        $sum: [0x40, 0x20]
      },
      length: 0x20
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(0x60),
      length: Data.fromNumber(0x20)
    });
  });

  it("works for a group of regions", async () => {
    const pointer: Pointer = {
      group: [{
        name: "a",
        location: "memory",
        offset: {
          $sum: [0x40, 0x20]
        },
        length: 0x20
      }, {
        location: "memory",
        offset: {
          $sum: [
            { ".offset": "a" },
            { ".length": "a" }
          ]
        },
        length: { ".length": "a" }
      }]
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(2);
    expect(regions.lookup["a"]).toEqual({
      name: "a",
      location: "memory",
      offset: Data.fromNumber(0x60),
      length: Data.fromNumber(0x20)
    });
    expect(regions[1]).toEqual({
      location: "memory",
      offset: Data.fromNumber(0x80),
      length: Data.fromNumber(0x20)
    });
  });

  it("works for a list of regions", async () => {
    const pointer: Pointer = {
      list: {
        count: 3,
        each: "i",
        is: {
          name: "item",
          location: "memory",
          offset: {
            $product: ["i", 32],
          },
          length: 32
        },
      },
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    const itemRegions = regions.named("item");
    expect(itemRegions).toHaveLength(3);

    for (const [index, region] of itemRegions.entries()) {
      expect(region).toEqual({
        name: "item",
        location: "memory",
        offset: Data.fromUint(
          Data.fromNumber(index).asUint() * 32n
        ).padUntilAtLeast(1),
        length: Data.fromNumber(32),
      })
    }
  });

  it("allows referencing previous fields by way of $this", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: 32,
      length: { ".offset": "$this" }
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32)
    });
  });

  it("allows referencing later fields by way of $this", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: { ".length": "$this" },
      length: 32
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32)
    });
  });

  it("allows referencing fields that reference other fields", async () => {
    const pointer: Pointer = {
      location: "storage",
      slot: { ".offset": "$this" },
      offset: { ".length": "$this" },
      length: 32
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "storage",
      slot: Data.fromNumber(32),
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32)
    });
  });

  it("throws an error on circular reference", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: { ".length": "$this" },
      length: { ".offset": "$this" },
    };

    const cursor = await dereference(pointer);

    await expect(cursor.view(state)).rejects.toThrow(
      "Circular reference detected: $this.offset"
    );
  });

  it("works for conditionals", async () => {
    const pointer: Pointer = {
      if: {
        $difference: [5, 5]
      },
      then: {
        name: "a",
        location: "memory",
        offset: 0,
        length: 0
      },
      else: {
        name: "b",
        location: "memory",
        offset: 0,
        length: 0
      }
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toEqual("b");
  });

  it("works for scopes", async () => {
    const pointer: Pointer = {
      define: {
        "example-offset": 0,
        "example-length": 32
      },
      in: {
        location: "memory",
        offset: "example-offset",
        length: "example-length"
      }
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].offset).toEqual(Data.fromNumber(0));
    expect(regions[0].length).toEqual(Data.fromNumber(32));
  });

  it("works for templates", async () => {
    const templates: Pointer.Templates = {
      "memory-range": {
        expect: ["offset", "length"],
        for: {
          location: "memory",
          offset: "offset",
          length: "length"
        }
      }
    };

    const pointer: Pointer = {
      define: {
        "offset": 0,
        "length": 32
      },
      in: {
        template: "memory-range"
      }
    };

    const cursor = await dereference(pointer, { templates });

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].offset).toEqual(Data.fromNumber(0));
    expect(regions[0].length).toEqual(Data.fromNumber(32));
  });
});
