import { expect } from "@jest/globals";
import {
  addSchema,
  validate,
  setMetaSchemaOutputFormat,
} from "@hyperjump/json-schema/draft-2020-12";
import { bundle } from "@hyperjump/json-schema/bundle";
import YAML from "yaml";
import indentString from "indent-string";
import { highlight } from "cli-highlight";

import {
  describeSchema,
  type DescribeSchemaOptions
} from "@ethdebug/format";

import schemas from "./schemas.js";

const main = () => {
  setMetaSchemaOutputFormat("BASIC");

  for (const schema of Object.values(schemas)) {
    addSchema(schema as any);
  }

  expect.extend({
    async toValidate(received: any, schemaOptions: DescribeSchemaOptions) {
      const { id, pointer, schema } = describeSchema(schemaOptions);

      if (typeof id !== "string") {
        throw new Error("Schema is not known to validator by ID");
      }

      const schemaReference = pointer
        ? `${id}${pointer}`
        : id;

      const schemaName =
        schema.title
          ? schema.title
          : schemaReference;

      const output = await validate(schemaReference, received, "DETAILED");

      const pass = output.valid;

      return {
        pass,
        message: () => `expected ${
          JSON.stringify(received)
        } ${
          pass
            ? "not to be"
            : "to be"
        } valid ${schemaName}.${
          pass
            ? ""
            : `\noutput:\n${
                indentString(
                  highlight(YAML.stringify(output), { language: "yaml" }),
                  2
                )
              }`
        }`
      };
    }
  });
}

main();
