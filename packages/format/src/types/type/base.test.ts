import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "../../describe";

import * as Base from "./base";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/type/base",
      pointer: "#/$defs/ElementaryType",
      guard: Base.isElementary
    },
    {
      schema: "schema:ethdebug/format/type/base",
      pointer: "#/$defs/ComplexType",
      guard: Base.isComplex
    },
    {
      schema: "schema:ethdebug/format/type/base",
      pointer: "#/$defs/TypeWrapper",
      guard: Base.isWrapper
    },
  ] as const;

  for (const { guard, ...describeSchemaOptions } of schemaGuards) {
    const { schema, pointer } = describeSchemaOptions;
    describe(
      `${schema.slice("schema:".length)}${pointer}`,
      () => {
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
