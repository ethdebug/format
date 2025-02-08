import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "../../describe";

import { Context, isContext } from "./context";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/program/context",
      guard: isContext
    },
    {
      schema: "schema:ethdebug/format/program/context/code",
      guard: Context.isCode
    },
    {
      schema: "schema:ethdebug/format/program/context/variables",
      guard: Context.isVariables
    },
    {
      schema: "schema:ethdebug/format/program/context/remark",
      guard: Context.isRemark
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
