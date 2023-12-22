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
    "type.schema.yaml",
    "operation/base.schema.yaml",
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
    [definitionName: string]: {
      extends: Set<string /* fully qualified base schema ID */>;
    }
  }
} = {
  "schema:ethdebug/format/type/base": {
    "ElementaryType": {
      extends: new Set([
        "schema:ethdebug/format/type/base"
      ])
    },
    "ComplexType": {
      extends: new Set([
        "schema:ethdebug/format/type/base"
      ])
    },
  },
  "schema:ethdebug/format/type": {
    "Type": {
      extends: new Set([
        "schema:ethdebug/format/type/base"
      ])
    },
    "UintType": {
      extends: new Set([
        "schema:ethdebug/format/type",
        "schema:ethdebug/format/type/base#/$defs/ElementaryType"
      ])
    },
    "ArrayType": {
      extends: new Set([
        "schema:ethdebug/format/type",
        "schema:ethdebug/format/type/base#/$defs/ComplexType"
      ])
    },
  },
}

const schemas = readSchemas();
export default schemas;
