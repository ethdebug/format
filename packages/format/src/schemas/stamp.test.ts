import { describe, expect, it } from "vitest";
import "#test/hyperjump";

const program = {
  contract: {
    name: "A",
    definition: { source: { id: 0 }, range: { offset: 0, length: 1 } },
  },
  environment: "call",
  instructions: [{ offset: 0 }],
};
const id = (schema: string, version = "0.1.0-draft.0") => ({
  schema,
  version,
});

// from the example in schemas/info.schema.yaml
const compilation = {
  id: "__301f3b6d85831638",
  compiler: {
    name: "egc",
    version: "0.2.3+commit.8b37fa7a",
  },
  settings: {
    turbo: true,
  },
  sources: [
    {
      id: 1,
      path: "Escrow.eg",
      language: "examplelang",
      contents: "func main(): return",
    },
  ],
};

describe("stamp", () => {
  it("accepts a program that names its own schema", async () => {
    await expect({
      ethdebug: id("ethdebug/format/program"),
      ...program,
    }).toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  it("accepts a program without the field", async () => {
    await expect(program).toValidate({
      schema: { id: "schema:ethdebug/format/program" },
    });
  });

  it("rejects a program that claims another schema", async () => {
    await expect({
      ethdebug: id("ethdebug/format/info"),
      ...program,
    }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  it("rejects versions the pattern forbids", async () => {
    for (const version of [
      "0.1",
      "v0.1.0",
      "01.1.0",
      "0.1.0-draft.01",
      "0.1.0+build",
      "0.1.0-",
    ]) {
      await expect({
        ethdebug: id("ethdebug/format/program", version),
        ...program,
      }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
    }
  });

  it("accepts numeric and named prereleases and stable versions", async () => {
    for (const version of ["0.1.0-2", "0.1.0-draft.3", "0.1.0", "1.0.0-rc.1"]) {
      await expect({
        ethdebug: id("ethdebug/format/program", version),
        ...program,
      }).toValidate({ schema: { id: "schema:ethdebug/format/program" } });
    }
  });

  it("rejects an extra key inside the field", async () => {
    await expect({
      ethdebug: { ...id("ethdebug/format/program"), extra: 1 },
      ...program,
    }).not.toValidate({ schema: { id: "schema:ethdebug/format/program" } });
  });

  const resources = { types: {}, pointers: {} };
  const info = { compilation, programs: [], ...resources };

  it("accepts resources that name resources", async () => {
    await expect({
      ethdebug: id("ethdebug/format/info/resources"),
      ...resources,
    }).toValidate({ schema: { id: "schema:ethdebug/format/info/resources" } });
  });

  it("rejects resources without the field", async () => {
    await expect(resources).not.toValidate({
      schema: { id: "schema:ethdebug/format/info/resources" },
    });
  });

  it("rejects resources that name info", async () => {
    await expect({
      ethdebug: id("ethdebug/format/info"),
      ...resources,
    }).not.toValidate({
      schema: { id: "schema:ethdebug/format/info/resources" },
    });
  });

  it("accepts an info document that names info", async () => {
    await expect({
      ethdebug: id("ethdebug/format/info"),
      ...info,
    }).toValidate({ schema: { id: "schema:ethdebug/format/info" } });
  });

  it("rejects an info document without the field", async () => {
    await expect(info).not.toValidate({
      schema: { id: "schema:ethdebug/format/info" },
    });
  });

  it("rejects an info document that names resources", async () => {
    await expect({
      ethdebug: id("ethdebug/format/info/resources"),
      ...info,
    }).not.toValidate({ schema: { id: "schema:ethdebug/format/info" } });
  });
});
