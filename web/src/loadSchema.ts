export const schemas = [
].map(schema => ({
  [schema.$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export const loadSchema = (id) => {
  const schema = schemas[id];
  return schema;
}
