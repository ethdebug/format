import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, expectTypeOf, it } from "vitest";

import { testSchemaGuards } from "#test/guards";
import { isProgram, type Program } from "#types/program";
import { version } from "#version";

import { Data } from "./index.js";

testSchemaGuards("ethdebug/format/data", [
  {
    schema: "schema:ethdebug/format/data/value",
    guard: Data.isValue,
  },
  {
    schema: "schema:ethdebug/format/data/unsigned",
    guard: Data.isUnsigned,
  },
  {
    schema: "schema:ethdebug/format/data/hex",
    guard: Data.isHex,
  },
  {
    schema: "schema:ethdebug/format/data/stamp",
    guard: Data.isStamp,
  },
]);

describe("stamp", () => {
  it("puts the schema and this package's version first", () => {
    const stamped = Data.stamp("ethdebug/format/info/resources", {
      types: {},
      pointers: {},
    });
    expect(stamped).toEqual({
      ethdebug: { schema: "ethdebug/format/info/resources", version },
      types: {},
      pointers: {},
    });
    expect(Object.keys(stamped)).toEqual(["ethdebug", "types", "pointers"]);
  });

  it("carries the literal schema name in its type", () => {
    const stamped = Data.stamp("ethdebug/format/program", { x: 1 });
    expectTypeOf(
      stamped.ethdebug.schema,
    ).toEqualTypeOf<"ethdebug/format/program">();
    expectTypeOf(stamped.x).toEqualTypeOf<number>();
  });

  it("builds a Program", () => {
    const program: Program = Data.stamp("ethdebug/format/program", {
      contract: {
        name: "A",
        definition: { source: { id: 0 }, range: { offset: 0, length: 1 } },
      },
      environment: "call",
      instructions: [{ offset: 0 }],
    });
    expect(isProgram(program)).toBe(true);
  });
});

describe("isStamp", () => {
  it("accepts a schema name and a semver version", () => {
    expect(
      Data.isStamp({
        schema: "ethdebug/format/program",
        version: "0.1.0-draft.0",
      }),
    ).toBe(true);
    expect(Data.isStamp({ schema: "x", version: "0.1.0-2" })).toBe(true);
  });

  it("rejects what the schema pattern rejects", () => {
    for (const v of ["v0.1.0", "0.1.0+build", " 0.1.0", "01.1.0", "0.1"]) {
      expect(Data.isStamp({ schema: "x", version: v })).toBe(false);
    }
    expect(Data.isStamp({ schema: "x" })).toBe(false);
    expect(Data.isStamp({ schema: "x", version: "0.1.0", extra: 1 })).toBe(
      false,
    );
  });
});

describe("versionPattern", () => {
  it("matches the pattern in schemas/data/stamp.schema.yaml", () => {
    const schemaPath = fileURLToPath(
      new URL("../../../../../schemas/data/stamp.schema.yaml", import.meta.url),
    );
    const parsed = parse(readFileSync(schemaPath, "utf8"));
    expect(Data.versionPattern.source).toBe(parsed.properties.version.pattern);
  });
});
