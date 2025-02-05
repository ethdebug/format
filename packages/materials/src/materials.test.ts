/// <reference path="../../../jest.d.ts" />
import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "@ethdebug/format";

import { Materials } from "./index.js";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: {
        id: "schema:ethdebug/format/materials/id"
      },
      guard: Materials.isId
    },
    {
      schema: {
        id: "schema:ethdebug/format/materials/reference"
      },
      guard: Materials.isReference
    },
    {
      schema: {
        id: "schema:ethdebug/format/materials/compilation"
      },
      guard: Materials.isCompilation
    },
    {
      schema: {
        id: "schema:ethdebug/format/materials/source"
      },
      guard: Materials.isSource
    },
    {
      schema: {
        id: "schema:ethdebug/format/materials/source-range"
      },
      guard: Materials.isSourceRange
    },
  ] as const;

  for (const { guard, ...describeSchemaOptions } of schemaGuards) {
    const { schema } = describeSchemaOptions;
    describe(schema.id.slice("schema:".length), () => {
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
