import YAML from "yaml";

import typeBaseSchemaYaml from "../../schemas/type/base.schema.yaml";

export const schemaYamls = [
  typeBaseSchemaYaml,
].map(schema => ({
  [YAML.parse(schema).$id]: schema
})).reduce((a, b) => ({ ...a, ...b }), {});

export type SchemaIndex = {
  [schemaId: `schema:${string}`]: {
      href: string /* relative or external URL */;
      title?: string;
  };
};

export const schemaIndex: SchemaIndex = {
  "schema:ethdebug/format/type/base": {
    title: "ethdebug/format/type/base schema",
    href: "/spec/type/base"
  },
  "schema:ethdebug/format/type/base#/$defs/TypeWrapper": {
    title: "Base type wrapper schema",
    href: "/spec/type/base#base-type-wrapper-schema",
  },
};

export interface DescribeSchemaOptions<
  S extends SchemaReference = SchemaReference
> {
  schema: S;
  pointer?: SchemaPointer;
};

export interface SchemaInfo {
  id?: string; // root ID only
  pointer: SchemaPointer; // normalized from root ID
  yaml: string;
  schema: object;
  rootSchema: object;
}

export function describeSchema({
  schema,
  pointer
}: DescribeSchemaOptions): SchemaInfo {
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
}: DescribeSchemaOptions<SchemaById>): SchemaInfo {
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
  const rootSchema = YAML.parse(rootYaml);

  return {
    id,
    pointer,
    yaml,
    schema,
    rootSchema
  }
}

function describeSchemaByYaml({
  schema: { yaml: referencedYaml },
  pointer
}: DescribeSchemaOptions<SchemaByYaml>): SchemaInfo {
  const yaml = pointToYaml(referencedYaml, pointer);

  const schema = YAML.parse(yaml);
  const rootSchema = YAML.parse(referencedYaml);

  const id = schema.$id;

  if (id) {
    return {
      id,
      pointer,
      yaml,
      schema,
      rootSchema
    }
  } else {
    return {
      pointer,
      yaml,
      schema,
      rootSchema
    }
  }
}

function describeSchemaByObject({
  schema: rootSchema,
  pointer
}: DescribeSchemaOptions<object>): SchemaInfo {
  const rootYaml = YAML.stringify(rootSchema);

  const yaml = pointToYaml(rootYaml, pointer);

  const schema = YAML.parse(yaml);

  const id = schema.$id;

  if (id) {
    return {
      id,
      pointer,
      yaml,
      schema,
      rootSchema
    }
  } else {
    return {
      pointer,
      yaml,
      schema,
      rootSchema
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
