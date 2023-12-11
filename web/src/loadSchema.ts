import typeSchemaYaml from "../../schemas/type.schema.yaml";
import typeBaseSchemaYaml from "../../schemas/type/base.schema.yaml";

export const schemas = [
  typeSchemaYaml,
  typeBaseSchemaYaml
].map(schema => ({
  [schema.$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export const loadSchema = (id) => {
  const schema = schemas[id];
  return schema;
}
