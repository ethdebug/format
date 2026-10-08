import { beforeEach, describe, expect, it, vi } from "vitest";

import { schemaYamls } from "./yamls.js";

vi.mock("yaml", async (importOriginal) => {
  const original = await importOriginal<typeof import("yaml")>();
  return {
    ...original,
    parse: vi.fn(original.parse),
    parseDocument: vi.fn(original.parseDocument),
  };
});

// a fresh copy of the package root, with fresh yaml spies, for each test
beforeEach(() => {
  vi.resetModules();
});
const load = async () => ({
  ...(await import("../index.js")),
  YAML: await import("yaml"),
});

const parsedYamls = async () => {
  const YAML = await vi.importActual<typeof import("yaml")>("yaml");
  return Object.entries(schemaYamls).map(
    ([id, yaml]) => [id, YAML.parse(yaml, { merge: true })] as const,
  );
};

describe("schemas", () => {
  it("parses each schema only when it is first read", async () => {
    const { schemas, schemaIds, YAML } = await load();
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
    const { schemas, schemaIds } = await load();

    expect(Object.keys(schemas)).toEqual(Object.keys(schemaYamls));
    expect(schemaIds).toEqual(Object.keys(schemaYamls));

    for (const [id, expected] of await parsedYamls()) {
      expect(schemas[id]).toEqual(expected);
    }
  });

  for (const lock of [Object.freeze, Object.seal]) {
    it(`reads every schema after ${lock.name}`, async () => {
      const { schemas } = await load();
      const id = "schema:ethdebug/format/pointer";
      const before = schemas[id];

      lock(schemas);

      for (const [id, expected] of await parsedYamls()) {
        expect(schemas[id]).toEqual(expected);
        expect(schemas[id]).toBe(schemas[id]);
      }
      expect(schemas[id]).toBe(before);
    });
  }

  it("accepts assignment like a plain object", async () => {
    const { schemas } = await load();
    const id = "schema:ethdebug/format/data/value";
    const replacement = { $id: id, title: "replaced" };

    schemas[id] = replacement;
    expect(schemas[id]).toBe(replacement);
  });
});
