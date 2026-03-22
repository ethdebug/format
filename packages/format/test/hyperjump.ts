import { expect } from "vitest";
import {
  addSchema,
  validate,
  setMetaSchemaOutputFormat,
} from "@hyperjump/json-schema/draft-2020-12";
import { BASIC } from "@hyperjump/json-schema/experimental";
import * as YAML from "yaml";
import indentString from "indent-string";
import { highlight } from "cli-highlight";

import { describeSchema, type DescribeSchemaOptions } from "../src/describe.js";

import { schemas } from "../src/schemas/index.js";

const main = () => {
  setMetaSchemaOutputFormat(BASIC);

  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }

  expect.extend({
    async toValidate(received: any, schemaOptions: DescribeSchemaOptions) {
      const { id, pointer, schema } = describeSchema(schemaOptions);

      if (typeof id !== "string") {
        throw new Error("Schema is not known to validator by ID");
      }

      const schemaReference = pointer ? `${id}${pointer}` : id;

      const schemaName = schema.title ? schema.title : schemaReference;

      const output = await validate(schemaReference, received, BASIC);

      const pass = output.valid;

      return {
        pass,
        message: () =>
          `expected input:\n${indentString(
            highlight(YAML.stringify(received), { language: "yaml" }),
            2,
          )}\n${pass ? "not to be" : "to be"} valid ${schemaName}.${
            pass
              ? ""
              : `\noutput:\n${indentString(
                  highlight(YAML.stringify(output), { language: "yaml" }),
                  2,
                )}`
          }`,
      };
    },
  });
};

main();
