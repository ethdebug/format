import { expect, describe, it } from "@jest/globals";
import { validate } from "@hyperjump/json-schema/draft-2020-12";

import schemas, {
  type JSONSchema,
  schemaExtensions
} from "../src/schemas.js";
import printErrors from "../src/printErrors.js";

// loads schemas into global hyperjump json schema validator
import "../src/loadSchemas.js";

const idsOfSchemasAllowedToOmitExamples = new Set([
  "schema:ethdebug/format/type",
  "schema:ethdebug/format/type/complex",
  "schema:ethdebug/format/type/elementary",
]);

describe("Examples", () => {
  for (const [id, schema] of Object.entries(schemas)) {
    testSchema({ id, schema });
  }
});

function testSchema(options: {
  id: string;
  schema: JSONSchema
}): void {
  const { id, schema } = options;

  const { title } = schema;

  const exampledDefinitionNames = definitionsWithExamples(schema);

  const hasOwnExamples = schema.examples && schema.examples.length > 0;
  const hasDefinitionsWithExamples = exampledDefinitionNames.length > 0;

  const hasExamples = hasOwnExamples || hasDefinitionsWithExamples;
  const allowedToOmitExamples = idsOfSchemasAllowedToOmitExamples.has(id);

  describe(title || id, () => {
    (
      allowedToOmitExamples
        ? it.skip
        : it
    )("has examples", () => {
      expect(hasExamples).toBe(true);
    });

    if (!hasExamples) {
      return;
    };

    testExamples({ id, schema });

    if (hasDefinitionsWithExamples) {
      describe("$defs", () => {
        for (const name of exampledDefinitionNames) {
          testSchema({
            id: `${id}#/$defs/${name}`,
            schema: schema!.$defs![name] as JSONSchema
          })
        }
      });
    }
  });
}

function testExamples(options: {
  id: string;
  schema: JSONSchema
}): void {
  const { id, schema } = options;
  const { examples = [] } = schema;

  for (const [index, example] of examples.entries()) {
    describe(`example #${index}`, () => {
      it(`is a valid ${schema.title || id}`, async () => {
        const output = await validate(id, example);
        expect(output.valid).toBe(true);
      })

      const testedParentSchemas = new Set<string>();

      // function to test parent schemas recursively
      const testParentSchemas = (schemaId: string) => {
        testedParentSchemas.add(schemaId);

        const parentSchemaIds = schemaExtensions[schemaId]?.extends || new Set<string>();

        for (const parentSchemaId of parentSchemaIds) {
          if (testedParentSchemas.has(parentSchemaId)) {
            continue;
          }

          it(`is also a valid ${parentSchemaId}`, async () => {
            const output = await validate(parentSchemaId, example);
            expect(output.valid).toBe(true);
          });

          // recurse to ancestors
          testParentSchemas(parentSchemaId);
        }
      };

      testParentSchemas(id);
    });
  }
}

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
