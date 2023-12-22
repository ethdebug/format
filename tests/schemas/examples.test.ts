import { expect, describe, it } from "@jest/globals";
import { validate } from "@hyperjump/json-schema/draft-2020-12";

import schemas, {
  type JSONSchema,
  schemaExtensions
} from "../src/schemas.js";
import printErrors from "../src/printErrors.js";

// loads schemas into global hyperjump json schema validator
import "../src/loadSchemas.js";

describe("Examples", () => {
  for (const [id, schema] of Object.entries(schemas)) {
    const exampledDefinitionNames = definitionsWithExamples(schema);

    if (exampledDefinitionNames.length > 0) {
      describe(id, () => {
        for (const name of exampledDefinitionNames) {
          const definitionSchemaId = `${id}#/$defs/${name}`;

          describe(`#/$defs/${name}`, () => {
            const {
              examples = []
            } = (schema!.$defs![name] as JSONSchema);

            for (const [index, example] of examples.entries()) {
              describe(`example #${index}`, () => {
                it(`is a valid ${name}`, async () => {
                  const output = await validate(definitionSchemaId, example);
                  expect(output.valid).toBe(true);
                })

                const {
                  extends: parentSchemaIds = new Set([])
                } = (schemaExtensions[id] || {})[name];

                // NOTE this is currently not recursive (it probably should be)
                for (const parentSchemaId of parentSchemaIds) {
                  it(`is also a valid ${parentSchemaId}`, async () => {
                    const output = await validate(parentSchemaId, example);
                    expect(output.valid).toBe(true);
                  });
                }
              });
            }
          });
        }
      });
    }
  }
});

function definitionsWithExamples(schema: JSONSchema): string[] {
  if (!("$defs" in schema) || !schema.$defs) {
    return [];
  }

  return Object.entries(schema.$defs)
    .flatMap(([name, definition]) => (
      typeof definition !== "boolean" &&
      "examples" in definition &&
      definition.examples &&
      definition.examples.length > 0
    )
      ? [name]
      : []
    )
}
