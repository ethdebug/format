/// <reference path="../../../jest.d.ts" />
import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "@ethdebug/format";

import * as Base from "./base.js";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: {
        id: "schema:ethdebug/format/type/base"
      },
      pointer: "#/$defs/ElementaryType",
      guard: Base.isElementary
    },
    {
      schema: {
        id: "schema:ethdebug/format/type/base"
      },
      pointer: "#/$defs/ComplexType",
      guard: Base.isComplex
    },
    {
      schema: {
        id: "schema:ethdebug/format/type/base"
      },
      pointer: "#/$defs/TypeWrapper",
      guard: Base.isWrapper
    },
  ] as const;

  for (const { guard, ...describeSchemaOptions } of schemaGuards) {
    const { schema, pointer } = describeSchemaOptions;
    describe(
      `${schema.id.slice("schema:".length)}${pointer}`,
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
