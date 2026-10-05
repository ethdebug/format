import { schemas } from "@ethdebug/format";
import {
  addSchema,
  validate as validateBy,
} from "@hyperjump/json-schema/draft-2020-12";
import { BASIC } from "@hyperjump/json-schema/experimental";

// Ajv does not follow `$dynamicRef` to a `$dynamicAnchor` that is not at a
// schema root (ajv-validator/ajv#1745), which the info schemas need.
for (const schema of Object.values(schemas)) {
  // @ts-expect-error describeSchema's JSONSchema type is not hyperjump's
  addSchema(schema);
}

export interface ValidationError {
  instancePath: string; // JSON pointer into the instance, "" for the root
  message: string;
}

export async function validate(
  id: string,
  instance: Parameters<typeof validateBy>[1],
): Promise<ValidationError[]> {
  const { errors = [] } = await validateBy(id, instance, BASIC);
  return errors.map(
    ({ keyword, absoluteKeywordLocation, instanceLocation }) => {
      const name = keyword.split("/").pop();
      const value = schemaValueAt(absoluteKeywordLocation);
      return {
        instancePath: decodeURIComponent(instanceLocation.replace(/^#/, "")),
        message:
          value === false
            ? "is not allowed"
            : value === undefined
              ? `fails ${absoluteKeywordLocation}`
              : `must satisfy ${name}: ${JSON.stringify(value)}`,
      };
    },
  );
}

function schemaValueAt(location: string): unknown {
  const [id, pointer = ""] = location.split("#");
  return (
    decodeURIComponent(pointer)
      .split("/")
      .slice(1)
      .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
      // @ts-expect-error walking an untyped schema
      .reduce((node, token) => node?.[token], schemas[id])
  );
}
