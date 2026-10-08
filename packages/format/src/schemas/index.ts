import { type JSONSchema, describeSchema } from "#describe";
import { schemaYamls } from "./yamls.js";
export type { Schema } from "./yamls.js";

export const schemaIds: string[] = Object.keys(schemaYamls);

// Each schema is parsed from YAML on first access, not at module load.
// The first read or write turns the getter into a plain data property.
export const schemas: { [id: string]: JSONSchema } = {};

for (const id of schemaIds) {
  const settle = (value: JSONSchema) => {
    Object.defineProperty(schemas, id, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return value;
  };

  Object.defineProperty(schemas, id, {
    enumerable: true,
    configurable: true,
    get: () => settle(describeSchema({ schema: { id } }).schema),
    set: settle,
  });
}
