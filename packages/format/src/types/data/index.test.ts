import { expect, describe, it } from "vitest";

import { describeSchema } from "../../describe";

import { Data } from "./index.js";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/data/value",
      guard: Data.isValue
    },
    {
      schema: "schema:ethdebug/format/data/unsigned",
      guard: Data.isUnsigned
    },
    {
      schema: "schema:ethdebug/format/data/hex",
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
