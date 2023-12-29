import YAML from "yaml";

import typeBaseSchemaYaml from "../../schemas/type/base.schema.yaml";

export const schemaYamls = [
  typeBaseSchemaYaml,
].map(schema => ({
  [YAML.parse(schema).$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export interface DescribeSchemaOptions<
  S extends SchemaReference = SchemaReference
> {
  schema: S;
  pointer?: SchemaPointer;
};

export interface DescribedSchema {
  id?: string; // root ID only
  pointer: SchemaPointer; // normalized from root ID
  schema: object;
  yaml: string;
}

export function describeSchema({
  schema,
  pointer
}: DescribeSchemaOptions): DescribedSchema {
  if (typeof pointer === "string" && !pointer.startsWith("#")) {
    throw new Error("`pointer` option must start with '#'");
  }

  return referencesId(schema)
    ? describeSchemaById({ schema, pointer })
    : referencesYaml(schema)
      ? describeSchemaByYaml({ schema, pointer })
      : describeSchemaByObject({ schema, pointer });
}

function describeSchemaById({
  schema: { id: referencedId },
  pointer: relativePointer
}: DescribeSchemaOptions<SchemaById>): DescribedSchema {
  // we need to handle the case where the schema is referenced by an ID
  // with a pointer specified, possibly with a separate `pointer` field too
  const [id, rawReferencedPointer] = referencedId.split("#");

  const pointer = rawReferencedPointer
    ? joinSchemaPointers([`#${rawReferencedPointer}`, relativePointer])
    : relativePointer;

  const rootYaml = schemaYamls[id]
  if (!rootYaml) {
    throw new Error(`Unknown schema with $id "${id}"`);
  }

  const yaml = pointToYaml(rootYaml, pointer);

  const schema = YAML.parse(yaml);

  return {
    id,
    pointer,
    yaml,
    schema
  }
}

function describeSchemaByYaml({
  schema: { yaml: referencedYaml },
  pointer
}: DescribeSchemaOptions<SchemaByYaml>): DescribedSchema {
  const yaml = pointToYaml(referencedYaml, pointer);

  const schema = YAML.parse(yaml);

  const id = schema.$id;

  if (id) {
    return {
      id,
      pointer,
      yaml,
      schema
    }
  } else {
    return {
      pointer,
      yaml,
      schema
    }
  }
}

function describeSchemaByObject({
  schema: referencedSchema,
  pointer
}: DescribeSchemaOptions<object>): DescribedSchema {
  const rootYaml = YAML.stringify(referencedSchema);

  const yaml = pointToYaml(rootYaml, pointer);

  const schema = YAML.parse(yaml);

  const id = schema.$id;

  if (id) {
    return {
      id,
      pointer,
      yaml,
      schema
    }
  } else {
    return {
      pointer,
      yaml,
      schema
    }
  }
}

function joinSchemaPointers(
  pointers: (SchemaPointer | undefined)[]
): SchemaPointer | undefined {
  const joined = pointers
    .filter((pointer): pointer is SchemaPointer => typeof pointer === "string")
    .map(pointer => pointer.slice(1))
    .join("");

  if (joined.length === 0) {
    return;
  }

  return `#${joined}`;
}

function pointToYaml(
  yaml: string,
  pointer?: SchemaPointer
): string {
  if (!pointer) {
    return yaml;
  }

  let doc = YAML.parseDocument(yaml);

  // slice(2) because we want to remove leading #/
  for (const step of pointer.slice(2).split("/")) {
    // @ts-ignore
    doc = doc.get(step, true);

    if (!doc) {
      throw new Error(`Pointer ${pointer} not found in schema`);
    }
  }

  return YAML.stringify(doc);
}

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

type NoExtraProperties<T, U extends T = T> =
  & U
  & Impossible<Exclude<keyof U, keyof T>>;

export type SchemaPointer = `#${string}`;

export type SchemaReference =
  | SchemaById
  | SchemaByYaml
  | object /* JSONSchema object itself */;

export type SchemaById = NoExtraProperties<{
  id: string;
}>;

export type SchemaByYaml = NoExtraProperties<{
  yaml: string;
}>;

export function referencesId(
  schema: SchemaReference
): schema is SchemaById {
  return Object.keys(schema).length === 1 && "id" in schema;
}

export function referencesYaml(
  schema: SchemaReference
): schema is SchemaByYaml {
  return Object.keys(schema).length === 1 && "yaml" in schema;
}
