import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "../../describe";

import { Materials } from "./index";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/materials/id",
      guard: Materials.isId
    },
    {
      schema: "schema:ethdebug/format/materials/reference",
      guard: Materials.isReference
    },
    {
      schema: "schema:ethdebug/format/materials/compilation",
      guard: Materials.isCompilation
    },
    {
      schema: "schema:ethdebug/format/materials/source",
      guard: Materials.isSource
    },
    {
      schema: "schema:ethdebug/format/materials/source-range",
      guard: Materials.isSourceRange
    },
  ] as const;

  for (const { guard, ...describeSchemaOptions } of schemaGuards) {
    const { schema } = describeSchemaOptions;
    describe(schema.slice("schema:".length), () => {
      it("matches its examples", () => {
        const {
          schema: {
            examples = []
          }
        } = describeSchema(describeSchemaOptions);

        expect(guard).toSatisfyAll(examples);
      });
    });
  }
});
