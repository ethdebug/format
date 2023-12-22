import typeSchemaYaml from "../../schemas/type.schema.yaml";
import typeBaseSchemaYaml from "../../schemas/type/base.schema.yaml";
import operationSchemaYaml from "../../schemas/operation.schema.yaml";
import operationBaseSchemaYaml from "../../schemas/operation/base.schema.yaml";


export const schemas = [
  typeSchemaYaml,
  typeBaseSchemaYaml,
  operationSchemaYaml,
  operationBaseSchemaYaml
].map(schema => ({
  [schema.$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export const loadSchema = (id) => {
  const schema = schemas[id];
  return schema;
}
