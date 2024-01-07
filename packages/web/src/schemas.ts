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
      "alias", "tuple", "array", "mapping", "struct", "function"
    ].map(kind => ({
      [`schema:ethdebug/format/type/complex/${kind}`]: {
        href: `/spec/type/complex/${kind}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  ),

  "schema:ethdebug/format/type/complex/function#/$defs/Parameters": {
    title: "Parameters schema",
    href: "/spec/type/complex/function#parameters-schema"
  },
};
