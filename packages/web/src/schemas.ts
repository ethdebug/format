export type SchemaIndex = {
  [schemaId: `schema:${string}`]: {
      href: string /* relative or external URL */;
      title?: string;
  };
};

const typeSchemaIndex: SchemaIndex = {
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

const pointerSchemaIndex: SchemaIndex = {
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

  "schema:ethdebug/format/pointer/template": {
    href: "/spec/pointer/template"
  },

  ...Object.entries({
    Literal: {
      title: "Literal values schema",
      anchor: "#literal-values"
    },
    Variable: {
      title: "Variable expression schema",
      anchor: "#variables"
    },
    Arithmetic: {
      title: "Arithmetic operation expression schema",
      anchor: "#arithmetic-operations"
    },
    Lookup: {
      title: "Lookup expression schema",
      anchor: "#lookup-region-definition"
    },
    Read: {
      title: "Read expression schema",
      anchor: "#reading-from-the-evm"
    },
    Keccak256: {
      title: "Keccak256 hash expression schema",
      anchor: "#keccak256-hashes"
    },
    Resize: {
      title: "Resize operation schema",
      anchor: "#resize-operations"
    },
    Reference: {
      title: "Region reference",
      anchor: "#region-references"
    },
  }).map(([def, { title, anchor }]) => ({
    [`schema:ethdebug/format/pointer/expression#/$defs/${def}`]: {
      title,
      href: `/spec/pointer/expression${anchor}`
    }
  })).reduce((a, b) => ({ ...a, ...b }), {}),
};

const dataSchemaIndex: SchemaIndex = ["value", "hex", "unsigned"].map(name => ({
  [`schema:ethdebug/format/data/${name}`]: {
    href: `/spec/data/${name}`
  }
})).reduce((a, b) => ({ ...a, ...b }), {});

const materialsSchemaIndex: SchemaIndex = {
  "schema:ethdebug/format/materials/id": {
    title: "Identifier schema",
    href: "/spec/materials/id#identifier-schema"
  },

  "schema:ethdebug/format/materials/reference": {
    title: "Reference schema",
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

  "schema:ethdebug/format/materials/source-range": {
    title: "Source range schema",
    href: "/spec/materials/source-range"
  },

  "schema:ethdebug/format/info": {
    title: "ethdebug/format/info",
    href: "/spec/info"
  },
};

const programSchemaIndex: SchemaIndex = {
  "schema:ethdebug/format/program": {
    href: "/spec/program"
  },

  "schema:ethdebug/format/program/instruction": {
    href: "/spec/program/instruction"
  },

  "schema:ethdebug/format/program/context": {
    href: "/spec/program/context"
  },

  ...(
    ["code", "variables", "remark", "pick"].map(name => ({
      [`schema:ethdebug/format/program/context/${name}`]: {
        href: `/spec/program/context/${name}`
      }
    })).reduce((a, b) => ({ ...a, ...b }), {})
  ),
};

const infoSchemaIndex: SchemaIndex = {
  "schema:ethdebug/format/info": {
    href: "/spec/info"
  },
  "schema:ethdebug/format/info/resources": {
    href: "/spec/info/resources"
  },
};

export const schemaIndex: SchemaIndex = {
  ...typeSchemaIndex,
  ...pointerSchemaIndex,
  ...dataSchemaIndex,
  ...materialsSchemaIndex,
  ...programSchemaIndex,
  ...infoSchemaIndex,
};
