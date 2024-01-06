import * as fs from "fs";
import * as path from "path";

import * as YAML from "yaml";
import type { JSONSchema as JSONSchemaTyped } from "json-schema-typed/draft-2020-12"

export type JSONSchema = Exclude<JSONSchemaTyped, boolean>;

const schemasRoot = path.resolve("../schemas");

const readSchemas = (): {
  [id: string]: JSONSchema
} => {
  const schemaPaths = [
    "type/base.schema.yaml",
    "type/wrapper.schema.yaml",
    "type/reference.schema.yaml",
    "type/definition.schema.yaml",
    "type/elementary/uint.schema.yaml",
    "type/elementary/int.schema.yaml",
    "type/elementary/bool.schema.yaml",
    "type/elementary/bytes.schema.yaml",
    "type/elementary/string.schema.yaml",
    "type/elementary/ufixed.schema.yaml",
    "type/elementary/fixed.schema.yaml",
    "type/elementary/address.schema.yaml",
    "type/elementary/contract.schema.yaml",
    "type/elementary/enum.schema.yaml",
    "type/elementary.schema.yaml",
    "type/complex/alias.schema.yaml",
    "type/complex/tuple.schema.yaml",
    "type/complex/array.schema.yaml",
    "type/complex/mapping.schema.yaml",
    "type/complex/struct.schema.yaml",
    "type/complex.schema.yaml",
    "type.schema.yaml",
  ];

  const schemas = schemaPaths
    .map((schemaPath) => {
      const contents = (
        fs.readFileSync(path.join(schemasRoot, schemaPath))
      ).toString();

      const schema = YAML.parse(contents);

      const { $id: id } = schema;

      return {
        [id]: schema
      };
    })
    .reduce((a, b) => ({ ...a, ...b }), {});

  return schemas;
}

export const schemaExtensions: {
  [schemaId: string]: {
    extends: Set<string /* fully qualified base schema ID */>;
  }
} = {
  "schema:ethdebug/format/type/base#/$defs/ElementaryType": {
    extends: new Set([
      "schema:ethdebug/format/type/base"
    ])
  },
  "schema:ethdebug/format/type/base#/$defs/ComplexType": {
    extends: new Set([
      "schema:ethdebug/format/type/base"
    ])
  },
  "schema:ethdebug/format/type": {
    extends: new Set([
      "schema:ethdebug/format/type/base"
    ])
  },
  "schema:ethdebug/format/type/elementary": {
    extends: new Set([
      "schema:ethdebug/format/type",
      "schema:ethdebug/format/type/base#/$defs/ElementaryType"
    ])
  },
  "schema:ethdebug/format/type/elementary/uint": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/int": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/bool": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/bytes": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/string": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/ufixed": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/fixed": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/address": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/contract": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/elementary/enum": {
    extends: new Set(["schema:ethdebug/format/type/elementary"])
  },
  "schema:ethdebug/format/type/complex": {
    extends: new Set([
      "schema:ethdebug/format/type",
      "schema:ethdebug/format/type/base#/$defs/ComplexType"
    ])
  },
  "schema:ethdebug/format/type/complex/alias": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
  "schema:ethdebug/format/type/complex/tuple": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
  "schema:ethdebug/format/type/complex/array": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
  "schema:ethdebug/format/type/complex/mapping": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
  "schema:ethdebug/format/type/complex/struct": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
}

const schemas = readSchemas();
export default schemas;
