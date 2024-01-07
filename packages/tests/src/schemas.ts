import { schemas } from "@ethdebug/format";

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
  "schema:ethdebug/format/type/complex/function": {
    extends: new Set(["schema:ethdebug/format/type/complex"])
  },
}

export default schemas;
