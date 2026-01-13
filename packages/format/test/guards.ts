import { expect, describe, it } from "vitest";

import { type DescribeSchemaOptions, describeSchema } from "../src";

export interface SchemaGuard extends DescribeSchemaOptions {
  guard(value: unknown): boolean;
}

export const testSchemaGuards = (
  namespace: string,
  schemaGuards: SchemaGuard[],
) => {
  describe(`type guards for ${namespace} schemas`, () => {
    for (const { guard, ...describeSchemaOptions } of schemaGuards) {
      const {
        id,
        pointer,
        schema: { examples = [] },
      } = describeSchema(describeSchemaOptions);

      const schemaName = `${id?.slice("schema:".length) || ""}${pointer || ""}`;

      it(`recognize examples from ${schemaName} schema`, () => {
        expect(guard).toSatisfyAll(examples);
      });
    }
  });
};
