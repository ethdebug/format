import { describe, expect, it, vi } from "vitest";
import * as YAML from "yaml";

import { schemaYamls } from "./yamls.js";

vi.mock("yaml", async (importOriginal) => {
  const original = await importOriginal<typeof import("yaml")>();
  return {
    ...original,
    parse: vi.fn(original.parse),
    parseDocument: vi.fn(original.parseDocument),
  };
});

describe("schemas", () => {
  it("parses each schema only when it is first read", async () => {
    const { schemas, schemaIds } = await import("../index.js");
    const parse = vi.mocked(YAML.parse);

    expect(schemaIds.length).toBeGreaterThan(0);
    expect(parse).not.toHaveBeenCalled();
    expect(YAML.parseDocument).not.toHaveBeenCalled();

    const id = "schema:ethdebug/format/pointer";
    expect(schemas[id]).toHaveProperty("$id", id);
    const calls = parse.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    expect(schemas[id]).toBe(schemas[id]);
    expect(parse.mock.calls.length).toBe(calls);
  });

  it("holds every schema, parsed from its YAML", async () => {
    const { schemas, schemaIds } = await import("../index.js");

    expect(Object.keys(schemas)).toEqual(Object.keys(schemaYamls));
    expect(schemaIds).toEqual(Object.keys(schemaYamls));

    for (const [id, yaml] of Object.entries(schemaYamls)) {
      expect(schemas[id]).toEqual(YAML.parse(yaml, { merge: true }));
    }
  });

  it("accepts assignment like a plain object", async () => {
    const { schemas } = await import("../index.js");
    const id = "schema:ethdebug/format/data/value";
    const replacement = { $id: id, title: "replaced" };

    schemas[id] = replacement;
    expect(schemas[id]).toBe(replacement);
  });
});
