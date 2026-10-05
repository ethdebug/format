import { describe, expect, it } from "vitest";
import { schemas } from "@ethdebug/format";

import { validate } from "./validate";

describe("validate", () => {
  for (const [id, schema] of Object.entries(schemas)) {
    for (const [index, example] of (schema.examples ?? []).entries()) {
      it(`accepts ${schema.title ?? id} example #${index}`, async () => {
        expect(await validate(id, example)).toEqual([]);
      });
    }
  }

  it("rejects a resources stamp that names another schema", async () => {
    const id = "schema:ethdebug/format/info/resources";
    const [example] = schemas[id].examples!;
    const errors = await validate(id, {
      ...example,
      ethdebug: { schema: "ethdebug/format/program", version: "0.1.0" },
    });
    expect(errors).toEqual([
      expect.objectContaining({ instancePath: "/ethdebug/schema" }),
    ]);
  });
});
