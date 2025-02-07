import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "../../describe";

import { Data } from "./index.js";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: {
        id: "schema:ethdebug/format/data/value"
      },
      guard: Data.isValue
    },
    {
      schema: {
        id: "schema:ethdebug/format/data/unsigned"
      },
      guard: Data.isUnsigned
    },
    {
      schema: {
        id: "schema:ethdebug/format/data/hex"
      },
      guard: Data.isHex
    },
  ] as const;

  it.each(schemaGuards)("matches its examples", ({
    guard,
    ...describeSchemaOptions
  }) => {
    const { schema: { examples = [] } } = describeSchema(describeSchemaOptions);

    expect(guard).toSatisfyAll(examples);
  });
});
