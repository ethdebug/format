import { expect, describe, it } from "vitest";

import { schemaExtensions } from "../../test/extensions";
import { schemas } from ".";
import type { JSONSchema } from "../describe";

// loads schemas into global hyperjump json schema validator
import "../../test/hyperjump";

const idsOfSchemasAllowedToOmitExamples = new Set([
  "schema:ethdebug/format/type",
  "schema:ethdebug/format/type/complex",
  "schema:ethdebug/format/type/elementary",
  "schema:ethdebug/format/pointer/region",
  "schema:ethdebug/format/pointer/collection",
]);

describe("Examples", () => {
  for (const [id, schema] of Object.entries(schemas)) {
    testSchema({ id, schema });
  }
});

function testSchema(options: { id: string; schema: JSONSchema }): void {
  const { id, schema } = options;

  const { title } = schema;

  const exampledDefinitionNames = definitionsWithExamples(schema);

  const hasOwnExamples = schema.examples && schema.examples.length > 0;
  const hasDefinitionsWithExamples = exampledDefinitionNames.length > 0;

  const hasExamples = hasOwnExamples || hasDefinitionsWithExamples;
  const allowedToOmitExamples = idsOfSchemasAllowedToOmitExamples.has(id);

  describe(title || id, () => {
    (allowedToOmitExamples ? it.skip : it)("has examples", () => {
      expect(hasExamples).toBe(true);
    });

    if (!hasExamples) {
      return;
    }

    testExamples({ id, schema });

    if (hasDefinitionsWithExamples) {
      describe("$defs", () => {
        for (const name of exampledDefinitionNames) {
          testSchema({
            id: `${id}#/$defs/${name}`,
            schema: schema!.$defs![name] as JSONSchema,
          });
        }
      });
    }
  });
}

function testExamples(options: { id: string; schema: JSONSchema }): void {
  const { id, schema } = options;
  const { examples = [] } = schema;

  for (const [index, example] of examples.entries()) {
    describe(`example #${index}`, () => {
      it(`is a valid ${schema.title || id}`, async () => {
        await expect(example).toValidate({ schema: { id } });
      });

      const testedParentSchemas = new Set<string>();

      // function to test parent schemas recursively
      const testParentSchemas = (schemaId: string) => {
        testedParentSchemas.add(schemaId);

        const parentSchemaIds =
          schemaExtensions[schemaId]?.extends || new Set<string>();

        for (const parentSchemaId of parentSchemaIds) {
          if (testedParentSchemas.has(parentSchemaId)) {
            continue;
          }

          it(`is also a valid ${parentSchemaId}`, async () => {
            await expect(example).toValidate({
              schema: { id: parentSchemaId },
            });
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

  return Object.entries(schema.$defs).flatMap(([name, definition]) =>
    typeof definition !== "boolean" &&
    "examples" in definition &&
    definition.examples &&
    definition.examples.length > 0
      ? [name]
      : [],
  );
}
