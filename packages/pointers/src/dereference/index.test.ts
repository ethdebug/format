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
        peek: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])),
        ),
      },
      memory: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])),
        ),
      },
      storage: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])),
        ),
      },
      calldata: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])),
        ),
      },
      returndata: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0x55, 0x66, 0x77, 0x88])),
        ),
      },
      transient: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])),
        ),
      },
      code: {
        read: vitest.fn(async () =>
          Data.fromBytes(new Uint8Array([0x11, 0x22, 0x33, 0x44])),
        ),
      },
    } as unknown as Machine.State;
  });

  it("works for a single region", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: {
        $sum: [0x40, 0x20],
      },
      length: 0x20,
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(0x60),
      length: Data.fromNumber(0x20),
    });
  });

  it("works for a group of regions", async () => {
    const pointer: Pointer = {
      group: [
        {
          name: "a",
          location: "memory",
          offset: {
            $sum: [0x40, 0x20],
          },
          length: 0x20,
        },
        {
          location: "memory",
          offset: {
            $sum: [{ ".offset": "a" }, { ".length": "a" }],
          },
          length: { ".length": "a" },
        },
      ],
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(2);
    expect(regions.lookup["a"]).toEqual({
      name: "a",
      location: "memory",
      offset: Data.fromNumber(0x60),
      length: Data.fromNumber(0x20),
    });
    expect(regions[1]).toEqual({
      location: "memory",
      offset: Data.fromNumber(0x80),
      length: Data.fromNumber(0x20),
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
          length: 32,
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
          Data.fromNumber(index).asUint() * 32n,
        ).padUntilAtLeast(1),
        length: Data.fromNumber(32),
      });
    }
  });

  it("allows referencing previous fields by way of $this", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: 32,
      length: { ".offset": "$this" },
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32),
    });
  });

  it("allows referencing later fields by way of $this", async () => {
    const pointer: Pointer = {
      location: "memory",
      offset: { ".length": "$this" },
      length: 32,
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "memory",
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32),
    });
  });

  it("allows referencing fields that reference other fields", async () => {
    const pointer: Pointer = {
      location: "storage",
      slot: { ".offset": "$this" },
      offset: { ".length": "$this" },
      length: 32,
    };

    const cursor = await dereference(pointer);

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      location: "storage",
      slot: Data.fromNumber(32),
      offset: Data.fromNumber(32),
      length: Data.fromNumber(32),
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
      "Circular reference detected: $this.offset",
    );
  });

  it("works for conditionals", async () => {
    const pointer: Pointer = {
      if: {
        $difference: [5, 5],
      },
      then: {
        name: "a",
        location: "memory",
        offset: 0,
        length: 0,
      },
      else: {
        name: "b",
        location: "memory",
        offset: 0,
        length: 0,
      },
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
        "example-length": 32,
      },
      in: {
        location: "memory",
        offset: "example-offset",
        length: "example-length",
      },
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
          length: "length",
        },
      },
    };

    const pointer: Pointer = {
      define: {
        offset: 0,
        length: 32,
      },
      in: {
        template: "memory-range",
      },
    };

    const cursor = await dereference(pointer, { templates });

    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].offset).toEqual(Data.fromNumber(0));
    expect(regions[0].length).toEqual(Data.fromNumber(32));
  });

  it("works for template references with yields (basic rename)", async () => {
    const templates: Pointer.Templates = {
      "named-region": {
        expect: ["slot"],
        for: {
          name: "data",
          location: "storage",
          slot: "slot",
        },
      },
    };

    const pointer: Pointer = {
      define: {
        slot: 0,
      },
      in: {
        template: "named-region",
        yields: {
          data: "my-data",
        },
      },
    };

    const cursor = await dereference(pointer, { templates });
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toEqual("my-data");
    expect(regions.lookup["my-data"]).toBeDefined();
    expect(regions.lookup["my-data"].name).toEqual("my-data");
  });

  it("works for multiple template references with different yields", async () => {
    const templates: Pointer.Templates = {
      "slot-region": {
        expect: ["slot"],
        for: {
          name: "value",
          location: "storage",
          slot: "slot",
        },
      },
    };

    const pointer: Pointer = {
      group: [
        {
          define: { slot: 0 },
          in: {
            template: "slot-region",
            yields: { value: "first-value" },
          },
        },
        {
          define: { slot: 1 },
          in: {
            template: "slot-region",
            yields: { value: "second-value" },
          },
        },
      ],
    };

    const cursor = await dereference(pointer, { templates });
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(2);
    expect(regions[0].name).toEqual("first-value");
    expect(regions[1].name).toEqual("second-value");
    expect(regions.lookup["first-value"]).toBeDefined();
    expect(regions.lookup["second-value"]).toBeDefined();
  });

  it("allows partial yields mapping (unmapped regions keep names)", async () => {
    const templates: Pointer.Templates = {
      "two-regions": {
        expect: ["slot"],
        for: {
          group: [
            { name: "a", location: "storage", slot: "slot" },
            { name: "b", location: "storage", slot: { $sum: ["slot", 1] } },
          ],
        },
      },
    };

    const pointer: Pointer = {
      define: { slot: 0 },
      in: {
        template: "two-regions",
        yields: { a: "renamed-a" }, // only rename "a", leave "b" as-is
      },
    };

    const cursor = await dereference(pointer, { templates });
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(2);
    expect(regions[0].name).toEqual("renamed-a");
    expect(regions[1].name).toEqual("b"); // unchanged
    expect(regions.lookup["renamed-a"]).toBeDefined();
    expect(regions.lookup["b"]).toBeDefined();
  });

  it("preserves internal references within template when using yields", async () => {
    const templates: Pointer.Templates = {
      "dependent-regions": {
        expect: ["base"],
        for: {
          group: [
            {
              name: "first",
              location: "memory",
              offset: "base",
              length: 32,
            },
            {
              name: "second",
              location: "memory",
              offset: {
                $sum: [{ ".offset": "first" }, { ".length": "first" }],
              },
              length: { ".length": "first" },
            },
          ],
        },
      },
    };

    const pointer: Pointer = {
      define: { base: 64 },
      in: {
        template: "dependent-regions",
        yields: {
          first: "my-first",
          second: "my-second",
        },
      },
    };

    const cursor = await dereference(pointer, { templates });
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(2);
    expect(regions[0].name).toEqual("my-first");
    expect(regions[0].offset).toEqual(Data.fromNumber(64));
    expect(regions[0].length).toEqual(Data.fromNumber(32));

    // Second region depends on first via internal reference
    expect(regions[1].name).toEqual("my-second");
    expect(regions[1].offset).toEqual(Data.fromNumber(96)); // 64 + 32
    expect(regions[1].length).toEqual(Data.fromNumber(32));
  });

  it("works for nested template references with yields", async () => {
    const templates: Pointer.Templates = {
      inner: {
        expect: ["slot"],
        for: {
          name: "inner-data",
          location: "storage",
          slot: "slot",
        },
      },
      outer: {
        expect: ["base-slot"],
        for: {
          group: [
            {
              define: { slot: "base-slot" },
              in: { template: "inner" },
            },
            {
              define: { slot: { $sum: ["base-slot", 1] } },
              in: { template: "inner" },
            },
          ],
        },
      },
    };

    const pointer: Pointer = {
      define: { "base-slot": 10 },
      in: {
        template: "outer",
        yields: { "inner-data": "outer-data" },
      },
    };

    const cursor = await dereference(pointer, { templates });
    const { regions } = await cursor.view(state);

    // Both inner regions should be renamed
    expect(regions).toHaveLength(2);
    expect(regions[0].name).toEqual("outer-data");
    expect(regions[1].name).toEqual("outer-data");
    expect(regions.named("outer-data")).toHaveLength(2);
  });

  it("works for inline template definitions", async () => {
    const pointer: Pointer = {
      templates: {
        "memory-range": {
          expect: ["offset", "length"],
          for: {
            location: "memory",
            offset: "offset",
            length: "length",
          },
        },
      },
      in: {
        define: {
          offset: 0,
          length: 32,
        },
        in: {
          template: "memory-range",
        },
      },
    };

    const cursor = await dereference(pointer);
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].offset).toEqual(Data.fromNumber(0));
    expect(regions[0].length).toEqual(Data.fromNumber(32));
  });

  it("inline templates take precedence over external templates", async () => {
    // External template defines a slot-based region
    const externalTemplates: Pointer.Templates = {
      "my-region": {
        expect: ["value"],
        for: {
          name: "external",
          location: "storage",
          slot: "value",
        },
      },
    };

    // Inline template overrides with memory-based region
    const pointer: Pointer = {
      templates: {
        "my-region": {
          expect: ["value"],
          for: {
            name: "inline",
            location: "memory",
            offset: "value",
            length: 32,
          },
        },
      },
      in: {
        define: { value: 64 },
        in: {
          template: "my-region",
        },
      },
    };

    const cursor = await dereference(pointer, { templates: externalTemplates });
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toEqual("inline");
    expect(regions[0].location).toEqual("memory");
  });

  it("works for nested inline templates", async () => {
    const pointer: Pointer = {
      templates: {
        "outer-template": {
          expect: ["base"],
          for: {
            templates: {
              "inner-template": {
                expect: ["offset"],
                for: {
                  name: "data",
                  location: "memory",
                  offset: "offset",
                  length: 32,
                },
              },
            },
            in: {
              define: { offset: "base" },
              in: { template: "inner-template" },
            },
          },
        },
      },
      in: {
        define: { base: 128 },
        in: { template: "outer-template" },
      },
    };

    const cursor = await dereference(pointer);
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toEqual("data");
    expect(regions[0].offset).toEqual(Data.fromNumber(128));
  });

  it("inline templates with yields work correctly", async () => {
    const pointer: Pointer = {
      templates: {
        "named-slot": {
          expect: ["slot"],
          for: {
            name: "value",
            location: "storage",
            slot: "slot",
          },
        },
      },
      in: {
        define: { slot: 5 },
        in: {
          template: "named-slot",
          yields: { value: "my-slot-value" },
        },
      },
    };

    const cursor = await dereference(pointer);
    const { regions } = await cursor.view(state);

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toEqual("my-slot-value");
    expect(regions.lookup["my-slot-value"]).toBeDefined();
  });
});
