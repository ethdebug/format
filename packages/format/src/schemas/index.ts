import { type JSONSchema, describeSchema } from "#describe";
import { schemaYamls } from "./yamls.js";
export type { Schema } from "./yamls.js";

export const schemaIds: string[] = Object.keys(schemaYamls);

// Each schema is parsed from YAML on first access, not at module load.
// Until then, its property is an accessor; the first read or write turns
// it into a plain data property, unless `schemas` has been frozen or
// sealed, in which case the accessor keeps returning the parsed value.
export const schemas: { [id: string]: JSONSchema } = {};

for (const id of schemaIds) {
  let parsed: JSONSchema | undefined;

  const settle = (value: JSONSchema) => {
    parsed = value;
    if (Object.getOwnPropertyDescriptor(schemas, id)?.configurable) {
      Object.defineProperty(schemas, id, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return value;
  };

  Object.defineProperty(schemas, id, {
    enumerable: true,
    configurable: true,
    get: () => settle(parsed ?? describeSchema({ schema: { id } }).schema),
    set: settle,
  });
}
