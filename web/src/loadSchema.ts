import typesSchemaYaml from "../../schemas/types.schema.yaml";

export const schemas = [
  typesSchemaYaml
].map(schema => ({
  [schema.$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export const loadSchema = (id) => {
  const schema = schemas[id];
  return schema;
}
