export const schemaExtensions: {
  [schemaId: string]: {
    extends: Set<string /* fully qualified base schema ID */>;
  };
} = {
  "schema:ethdebug/format/type/base#/$defs/ElementaryType": {
    extends: new Set(["schema:ethdebug/format/type/base"]),
  },
  "schema:ethdebug/format/type/base#/$defs/ComplexType": {
    extends: new Set(["schema:ethdebug/format/type/base"]),
  },
  "schema:ethdebug/format/type": {
    extends: new Set(["schema:ethdebug/format/type/base"]),
  },
  "schema:ethdebug/format/type/elementary": {
    extends: new Set([
      "schema:ethdebug/format/type",
      "schema:ethdebug/format/type/base#/$defs/ElementaryType",
    ]),
  },
  "schema:ethdebug/format/type/elementary/number": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/flags": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/bool": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/bytes": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/string": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/address": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/elementary/enum": {
    extends: new Set(["schema:ethdebug/format/type/elementary"]),
  },
  "schema:ethdebug/format/type/complex": {
    extends: new Set([
      "schema:ethdebug/format/type",
      "schema:ethdebug/format/type/base#/$defs/ComplexType",
    ]),
  },
  "schema:ethdebug/format/type/complex/alias": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
  "schema:ethdebug/format/type/complex/array": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
  "schema:ethdebug/format/type/complex/mapping": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
  "schema:ethdebug/format/type/complex/struct": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
  "schema:ethdebug/format/type/complex/variant": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
  "schema:ethdebug/format/type/complex/function": {
    extends: new Set(["schema:ethdebug/format/type/complex"]),
  },
};
