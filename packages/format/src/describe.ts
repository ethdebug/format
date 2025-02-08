import * as YAML from "yaml";

import { schemaYamls } from "../yamls";

import type { JSONSchema as JSONSchemaTyped } from "json-schema-typed/draft-2020-12"

export type JSONSchema = Exclude<JSONSchemaTyped, boolean>;

export interface DescribeSchemaOptions<
  S extends SchemaReference = SchemaReference
> {
  schema: S;
  pointer?: SchemaPointer;
};

export interface SchemaInfo {
  id?: string; // root ID only
  pointer?: SchemaPointer; // normalized from root ID
  yaml: string;
  schema: JSONSchema;
  rootSchema: JSONSchema;
}

const parseOptions = {
  // merge keys were removed from YAML 1.2 spec but used by these schemas
  merge: true
};

export function describeSchema({
  schema,
  pointer
}: DescribeSchemaOptions): SchemaInfo {
  if (typeof pointer === "string" && !pointer.startsWith("#")) {
    throw new Error("`pointer` option must start with '#'");
  }

  const pointerOptions = pointer
    ? { pointer }
    : {};

  if (referencesId(schema)) {
    return describeSchemaById({
      schema: typeof schema === "object"
        ? schema
        : { id: schema },
      ...pointerOptions
    });
  }

  if (referencesYaml(schema)) {
    return describeSchemaByYaml({
      schema,
      ...pointerOptions
    });
  }

  return describeSchemaByObject({
    schema,
    ...pointerOptions
  });
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

  const schema = YAML.parse(yaml, parseOptions);
  const rootSchema = YAML.parse(rootYaml, parseOptions);

  return {
    id,
    ...(pointer ? { pointer } : {}),
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

  const schema = YAML.parse(yaml, parseOptions);
  const rootSchema = YAML.parse(referencedYaml, parseOptions);

  const id = schema.$id;

  if (id) {
    return {
      id,
      ...(pointer ? { pointer } : {}),
      yaml,
      schema,
      rootSchema
    }
  } else {
    return {
      ...(pointer ? { pointer } : {}),
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

  const schema = YAML.parse(yaml, parseOptions);

  const id = schema.$id;

  if (id) {
    return {
      id,
      ...(pointer ? { pointer } : {}),
      yaml,
      schema,
      rootSchema
    }
  } else {
    return {
      ...(pointer ? { pointer } : {}),
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
  | SchemaId
  | SchemaById
  | SchemaByYaml
  | object /* JSONSchema object itself */;

export type SchemaId = string;

export type SchemaById = NoExtraProperties<{
  id: SchemaId;
}>;

export type SchemaByYaml = NoExtraProperties<{
  yaml: string;
}>;

export function referencesId(
  schema: SchemaReference
): schema is SchemaId | SchemaById {
  return (
    typeof schema === "string" ||
    (Object.keys(schema).length === 1 && "id" in schema)
  );
}

export function referencesYaml(
  schema: SchemaReference
): schema is SchemaByYaml {
  return typeof schema === "object" &&
    Object.keys(schema).length === 1 && "yaml" in schema;
}
