/// <reference path="../../../jest.d.ts" />
import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "@ethdebug/format";

import { Instruction, isInstruction } from "./instruction.js";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: {
        id: "schema:ethdebug/format/program/instruction"
      },
      guard: isInstruction
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
