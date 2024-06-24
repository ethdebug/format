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

  "schema:ethdebug/format/pointer": {
    href: "/spec/pointer"
  },

  "schema:ethdebug/format/pointer/region": {
    href: "/spec/pointer/region"
  },

  "schema:ethdebug/format/pointer/region/base": {
    href: "/spec/pointer/region/base"
  },

  ...(
    [
      "stack", "memory", "storage", "calldata", "returndata", "transient",
      "code"
    ].map(location => ({
      [`schema:ethdebug/format/pointer/region/${location}`]: {
        href: `/spec/pointer/region/location/${location}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  ),

  ...(
    [
      "slice", "segment"
    ].map(scheme => ({
      [`schema:ethdebug/format/pointer/scheme/${scheme}`]: {
        href: `/spec/pointer/region/scheme/${scheme}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  ),

  "schema:ethdebug/format/pointer/collection": {
    href: "/spec/pointer/collection"
  },

  ...(
    [
      "group", "list", "conditional", "scope"
    ].map(collection => ({
      [`schema:ethdebug/format/pointer/collection/${collection}`]: {
        href: `/spec/pointer/collection/${collection}`
      }
    }))
    .reduce((a, b) => ({ ...a, ...b }), {})
  ),

  "schema:ethdebug/format/pointer/expression": {
    href: "/spec/pointer/expression"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Literal": {
    title: "Literal values schema",
    href: "/spec/pointer/expression#literal-values"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Variable": {
    title: "Variable expression schema",
    href: "/spec/pointer/expression#variables"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Arithmetic": {
    title: "Arithmetic operation expression schema",
    href: "/spec/pointer/expression#arithmetic-operations"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Lookup": {
    title: "Lookup expression schema",
    href: "/spec/pointer/expression#lookup-region-definition"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Read": {
    title: "Read expression schema",
    href: "/spec/pointer/expression#reading-from-the-evm"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Keccak256": {
    title: "Keccak256 hash expression schema",
    href: "/spec/pointer/expression#keccak256-hashes"
  },

  "schema:ethdebug/format/pointer/expression#/$defs/Reference": {
    title: "Region reference",
    href: "/spec/pointer/expression#region-references"
  },

  "schema:ethdebug/format/materials/id": {
    title: "Identifier schema",
    href: "/spec/materials/id#identifier-schema"
  },

  "schema:ethdebug/format/materials/reference": {
    title: "Identifier schema",
    href: "/spec/materials/id#reference-schema"
  },

  "schema:ethdebug/format/materials/compilation": {
    title: "Compilation schema",
    href: "/spec/materials/compilation"
  },

  "schema:ethdebug/format/materials/source": {
    title: "Source schema",
    href: "/spec/materials/source"
  },
};
