import YAML from "yaml";

import typeBaseSchemaYaml from "../../schemas/type/base.schema.yaml";
import typeWrapperSchemaYaml from "../../schemas/type/wrapper.schema.yaml";
import typeReferenceSchemaYaml from "../../schemas/type/reference.schema.yaml";
import typeDefinitionSchemaYaml from "../../schemas/type/definition.schema.yaml";
import typeElementaryUintSchemaYaml from "../../schemas/type/elementary/uint.schema.yaml";
import typeElementaryIntSchemaYaml from "../../schemas/type/elementary/int.schema.yaml";
import typeElementaryBoolSchemaYaml from "../../schemas/type/elementary/bool.schema.yaml";
import typeElementaryBytesSchemaYaml from "../../schemas/type/elementary/bytes.schema.yaml";
import typeElementaryStringSchemaYaml from "../../schemas/type/elementary/string.schema.yaml";
import typeElementaryUfixedSchemaYaml from "../../schemas/type/elementary/ufixed.schema.yaml";
import typeElementaryFixedSchemaYaml from "../../schemas/type/elementary/fixed.schema.yaml";
import typeElementaryAddressSchemaYaml from "../../schemas/type/elementary/address.schema.yaml";
import typeElementaryContractSchemaYaml from "../../schemas/type/elementary/contract.schema.yaml";
import typeElementaryEnumSchemaYaml from "../../schemas/type/elementary/enum.schema.yaml";
import typeElementarySchemaYaml from "../../schemas/type/elementary.schema.yaml";
import typeComplexAliasSchemaYaml from "../../schemas/type/complex/alias.schema.yaml";
import typeComplexArraySchemaYaml from "../../schemas/type/complex/array.schema.yaml";
import typeComplexMappingSchemaYaml from "../../schemas/type/complex/mapping.schema.yaml";
import typeComplexStructSchemaYaml from "../../schemas/type/complex/struct.schema.yaml";
import typeComplexTupleSchemaYaml from "../../schemas/type/complex/tuple.schema.yaml";
import typeComplexSchemaYaml from "../../schemas/type/complex.schema.yaml";
import typeSchemaYaml from "../../schemas/type.schema.yaml";

export const schemaYamls = [
  typeBaseSchemaYaml,
  typeWrapperSchemaYaml,
  typeReferenceSchemaYaml,
  typeDefinitionSchemaYaml,
  typeElementaryUintSchemaYaml,
  typeElementaryIntSchemaYaml,
  typeElementaryUfixedSchemaYaml,
  typeElementaryFixedSchemaYaml,
  typeElementaryBoolSchemaYaml,
  typeElementaryBytesSchemaYaml,
  typeElementaryStringSchemaYaml,
  typeElementaryAddressSchemaYaml,
  typeElementaryContractSchemaYaml,
  typeElementaryEnumSchemaYaml,
  typeElementarySchemaYaml,
  typeComplexAliasSchemaYaml,
  typeComplexArraySchemaYaml,
  typeComplexMappingSchemaYaml,
  typeComplexStructSchemaYaml,
  typeComplexTupleSchemaYaml,
  typeComplexSchemaYaml,
  typeSchemaYaml,
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
  "schema:ethdebug/format/type/wrapper": {
    title: "Type wrapper schema",
    href: "/spec/type/concepts#type-wrapper-schema",
  },
  "schema:ethdebug/format/type/reference": {
    title: "Type reference schema",
    href: "/spec/type/concepts#type-reference-schema"
  },
  "schema:ethdebug/format/type/definition": {
    title: "Type definition schema",
    href: "/spec/type/concepts#type-definition-schema"
  },
  "schema:ethdebug/format/type": {
    href: "/spec/type"
  },
  "schema:ethdebug/format/type/elementary": {
    href: "/spec/type#elementary-type-schema"
  },
  "schema:ethdebug/format/type/complex": {
    href: "/spec/type#complex-type-schema"
  },
  ...(
    [
      "uint", "int", "ufixed", "fixed", "bool", "bytes", "string", "address",
      "contract", "enum"
    ].map(kind => ({
      [`schema:ethdebug/format/type/elementary/${kind}`]: {
        href: `/spec/type/elementary/${kind}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  ),
  ...(
    [
      "alias", "tuple", "array", "mapping", "struct"
    ].map(kind => ({
      [`schema:ethdebug/format/type/complex/${kind}`]: {
        href: `/spec/type/complex/${kind}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  )



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
