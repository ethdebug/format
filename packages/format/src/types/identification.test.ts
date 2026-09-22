import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  identify,
  isIdentification,
  supports,
  versionPattern,
} from "./identification.js";
import { version } from "#version";

describe("isIdentification", () => {
  it("accepts a schema id and a semver version", () => {
    expect(
      isIdentification({
        schema: "schema:ethdebug/format/program",
        version: "0.1.0-draft.0",
      }),
    ).toBe(true);
    expect(isIdentification({ schema: "x", version: "0.1.0-2" })).toBe(true);
  });

  it("rejects what the schema pattern rejects", () => {
    for (const v of ["v0.1.0", "0.1.0+build", " 0.1.0", "01.1.0", "0.1"]) {
      expect(isIdentification({ schema: "x", version: v })).toBe(false);
    }
    expect(isIdentification({ schema: "x" })).toBe(false);
    expect(isIdentification({ schema: "x", version: "0.1.0", extra: 1 })).toBe(
      false,
    );
  });
});

describe("versionPattern", () => {
  it("matches the pattern in schemas/identification.schema.yaml", () => {
    const schemaPath = fileURLToPath(
      new URL(
        "../../../../schemas/identification.schema.yaml",
        import.meta.url,
      ),
    );
    const parsed = parse(readFileSync(schemaPath, "utf8"));
    expect(versionPattern.source).toBe(parsed.properties.version.pattern);
  });
});

describe("identify", () => {
  it("names the schema and this package's version", () => {
    expect(identify("schema:ethdebug/format/program")).toEqual({
      schema: "schema:ethdebug/format/program",
      version,
    });
  });
});

describe("supports", () => {
  it("accepts the same key and warns on a newer version", () => {
    expect(supports("0.1.0-draft.1", "0.1.0-draft.1")).toBe("ok");
    expect(supports("0.1.0-draft.3", "0.1.0-draft.1")).toBe("newer");
    expect(supports("0.1.0", "0.1.0-draft.1")).toBe("newer");
    expect(supports("0.1.0-draft.0", "0.1.0")).toBe("ok");
    expect(supports("0.1.0-2", "0.1.0-draft.0")).toBe("ok");
    expect(supports("1.3.0", "1.0.0")).toBe("newer");
    expect(supports("1.0.0-draft.0", "1.0.0")).toBe("ok");
  });

  it("rejects a differing key", () => {
    expect(supports("0.2.0-draft.0", "0.1.0-draft.1")).toBe("unsupported");
    expect(supports("2.0.0", "1.0.0")).toBe("unsupported");
    expect(supports("1.0.0", "0.1.0")).toBe("unsupported");
  });

  it("rejects what semver cannot parse", () => {
    expect(supports("banana", "0.1.0")).toBe("unsupported");
    expect(supports("0.1.0", "")).toBe("unsupported");
  });
});
