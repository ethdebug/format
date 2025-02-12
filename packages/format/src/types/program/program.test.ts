import { expect, describe, it } from "vitest";

import { describeSchema } from "../../describe";

import { Program, isProgram } from "./program";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/program",
      guard: isProgram
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
