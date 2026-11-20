import { describe, it, expect } from "vitest";

import { testSchemaGuards } from "#test/guards";
// loads schemas into the global hyperjump validator + `toValidate` matcher
import "#test/hyperjump";

import { Type, isType } from "./index.js";

testSchemaGuards("ethdebug/format/type", [
  {
    schema: "schema:ethdebug/format/type",
    guard: isType,
  },

  // elementary types

  {
    schema: "schema:ethdebug/format/type/elementary",
    guard: Type.isElementary,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/number",
    guard: Type.Elementary.isNumber,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/address",
    guard: Type.Elementary.isAddress,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/bool",
    guard: Type.Elementary.isBool,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/enum",
    guard: Type.Elementary.isEnum,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/flags",
    guard: Type.Elementary.isFlags,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/bytes",
    guard: Type.Elementary.isBytes,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/string",
    guard: Type.Elementary.isString,
  },

  // complex types

  {
    schema: "schema:ethdebug/format/type/complex",
    guard: Type.isComplex,
  },
  {
    schema: "schema:ethdebug/format/type/complex/alias",
    guard: Type.Complex.isAlias,
  },
  {
    schema: "schema:ethdebug/format/type/complex/array",
    guard: Type.Complex.isArray,
  },
  {
    schema: "schema:ethdebug/format/type/complex/mapping",
    guard: Type.Complex.isMapping,
  },
  {
    schema: "schema:ethdebug/format/type/complex/struct",
    guard: Type.Complex.isStruct,
  },
  {
    schema: "schema:ethdebug/format/type/complex/variant",
    guard: Type.Complex.isVariant,
  },
  {
    schema: "schema:ethdebug/format/type/complex/function",
    guard: Type.Complex.isFunction,
  },

  // type reference and specifier

  {
    schema: "schema:ethdebug/format/type/reference",
    guard: Type.isReference,
  },
  {
    schema: "schema:ethdebug/format/type/specifier",
    guard: Type.isSpecifier,
  },
  {
    schema: "schema:ethdebug/format/type/wrapper",
    guard: Type.isWrapper,
  },
] as const);

// The address type's schema uses a oneOf to distinguish normal /
// library / interface contracts via the `library` and `interface`
// flags of its definition. The guard must agree with the schema, in
// particular it must reject a definition that sets both flags true.
describe("Type.Elementary.isAddress definition flags", () => {
  const addressSchema = "schema:ethdebug/format/type/elementary/address";

  const legal = [
    { title: "plain", value: { kind: "address" } },
    {
      title: "normal contract",
      value: { kind: "address", definition: { name: "T" } },
    },
    {
      title: "normal contract (flags explicitly false)",
      value: {
        kind: "address",
        definition: { name: "T", library: false, interface: false },
      },
    },
    {
      title: "library",
      value: { kind: "address", definition: { name: "T", library: true } },
    },
    {
      title: "interface",
      value: { kind: "address", definition: { name: "T", interface: true } },
    },
  ] as const;

  const illegal = [
    {
      title: "both library and interface true",
      value: {
        kind: "address",
        definition: { name: "T", library: true, interface: true },
      },
    },
    {
      title: "a non-boolean library flag",
      value: { kind: "address", definition: { name: "T", library: "true" } },
    },
    {
      title: "a non-boolean interface flag",
      value: { kind: "address", definition: { name: "T", interface: 1 } },
    },
  ] as const;

  for (const { title, value } of legal) {
    it(`accepts the ${title} address shape`, async () => {
      expect(Type.Elementary.isAddress(value)).toBe(true);
      await expect(value).toValidate({ schema: addressSchema });
    });
  }

  for (const { title, value } of illegal) {
    it(`rejects an address with ${title}`, async () => {
      expect(Type.Elementary.isAddress(value)).toBe(false);
      await expect(value).not.toValidate({ schema: addressSchema });
    });
  }
});

describe("rejected values", () => {
  const typeSchema = "schema:ethdebug/format/type";

  const rejected = [
    {
      title: "the removed uint kind",
      value: { kind: "uint", bits: 256 },
    },
    {
      title: "an unknown complex kind with a removed-kind child",
      value: {
        class: "complex",
        kind: "pair",
        contains: [{ type: { kind: "uint", bits: 256 } }],
      },
    },
    {
      title: "a negative number places",
      value: { kind: "number", places: -1 },
    },
    {
      title: "a non-boolean number signed",
      value: { kind: "number", signed: "yes" },
    },
    { title: "an empty enum", value: { kind: "enum", values: [] } },
    {
      title: "a repeated enum value",
      value: { kind: "enum", values: ["A", "A"] },
    },
    { title: "an empty flags", value: { kind: "flags", values: [] } },
    {
      title: "a repeated flags value",
      value: { kind: "flags", values: ["A", "A"] },
    },
    {
      title: "the removed tuple kind",
      value: { kind: "tuple", contains: [] },
    },
    {
      title: "a variant case without a discriminant",
      value: { kind: "variant", cases: [{ name: "A" }] },
    },
    {
      title: "a variant case with a payload that is not a wrapper",
      value: {
        kind: "variant",
        cases: [{ name: "A", discriminant: 0, payload: { kind: "bool" } }],
      },
    },
    {
      title: "a function without returns",
      value: { kind: "function", internal: true, parameters: [] },
    },
    {
      title: "the old function shape",
      value: {
        kind: "function",
        internal: true,
        contains: { parameters: { type: { kind: "struct", contains: [] } } },
      },
    },
    {
      title: "a function with neither internal nor external",
      value: { kind: "function", parameters: [], returns: [] },
    },
    {
      title: "an internal function with a contract",
      value: {
        kind: "function",
        internal: true,
        parameters: [],
        returns: [],
        contract: { type: { id: "C" } },
      },
    },
    {
      title: "an external function with a plain address contract",
      value: {
        kind: "function",
        external: true,
        parameters: [],
        returns: [],
        contract: { type: { kind: "address" } },
      },
    },
    {
      title: "a non-string label",
      value: { kind: "bool", label: 7 },
    },
  ] as const;

  for (const { title, value } of rejected) {
    it(`rejects ${title}`, async () => {
      expect(isType(value)).toBe(false);
      await expect(value).not.toValidate({ schema: typeSchema });
    });
  }
});

describe("complex types without contains", () => {
  const typeSchema = "schema:ethdebug/format/type";
  const baseSchema = "schema:ethdebug/format/type/base";

  const variant = {
    class: "complex",
    kind: "variant",
    discriminant: { type: { kind: "number" } },
    cases: [{ name: "A", discriminant: 0 }],
  };
  const fn = {
    class: "complex",
    kind: "function",
    internal: true,
    parameters: [],
    returns: [],
  };

  const accepted = [
    {
      title: "an unknown complex kind that contains a known variant",
      value: { class: "complex", kind: "pair", contains: [{ type: variant }] },
    },
    {
      title: "an unknown complex kind that contains a known function",
      value: { class: "complex", kind: "pair", contains: [{ type: fn }] },
    },
  ] as const;

  for (const { title, value } of accepted) {
    it(`accepts ${title}`, async () => {
      expect(isType(value)).toBe(true);
      await expect(value).toValidate({ schema: typeSchema });
    });
  }

  it("accepts a complex base type with a class and no contains", async () => {
    const value = { class: "complex", kind: "thing" };
    expect(Type.Base.isType(value)).toBe(true);
    await expect(value).toValidate({ schema: baseSchema });
  });

  it("rejects an unknown kind without a class", () => {
    expect(isType({ kind: "thing" })).toBe(false);
  });
});
