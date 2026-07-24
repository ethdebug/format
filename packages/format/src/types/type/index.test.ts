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
    schema: "schema:ethdebug/format/type/elementary/uint",
    guard: Type.Elementary.isUint,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/int",
    guard: Type.Elementary.isInt,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/ufixed",
    guard: Type.Elementary.isUfixed,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/fixed",
    guard: Type.Elementary.isFixed,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/bool",
    guard: Type.Elementary.isBool,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/bytes",
    guard: Type.Elementary.isBytes,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/string",
    guard: Type.Elementary.isString,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/address",
    guard: Type.Elementary.isAddress,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/contract",
    guard: Type.Elementary.isContract,
  },
  {
    schema: "schema:ethdebug/format/type/elementary/enum",
    guard: Type.Elementary.isEnum,
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
    schema: "schema:ethdebug/format/type/complex/tuple",
    guard: Type.Complex.isTuple,
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

// The contract type's schema uses a oneOf to distinguish normal /
// library / interface contracts via the `library` and `interface`
// flags. The guard must carry those flags and agree with the schema —
// in particular it must reject a contract that sets both flags true
// (which matches two oneOf branches at once).
describe("Type.Elementary.isContract flag semantics", () => {
  const contractSchema = "schema:ethdebug/format/type/elementary/contract";

  const legal = [
    { title: "normal (flags omitted)", value: { kind: "contract" } },
    {
      title: "normal (flags explicitly false)",
      value: { kind: "contract", library: false, interface: false },
    },
    { title: "library", value: { kind: "contract", library: true } },
    { title: "interface", value: { kind: "contract", interface: true } },
  ] as const;

  const illegal = [
    {
      title: "both library and interface true",
      value: { kind: "contract", library: true, interface: true },
    },
  ] as const;

  for (const { title, value } of legal) {
    it(`accepts the ${title} contract shape`, async () => {
      expect(Type.Elementary.isContract(value)).toBe(true);
      // guard agrees with the schema
      await expect(value).toValidate({ schema: contractSchema });
    });
  }

  for (const { title, value } of illegal) {
    it(`rejects a contract with ${title}`, async () => {
      expect(Type.Elementary.isContract(value)).toBe(false);
      // guard agrees with the schema
      await expect(value).not.toValidate({ schema: contractSchema });
    });
  }

  it("rejects non-boolean flag values", () => {
    expect(
      Type.Elementary.isContract({ kind: "contract", library: "true" }),
    ).toBe(false);
    expect(Type.Elementary.isContract({ kind: "contract", interface: 1 })).toBe(
      false,
    );
  });
});
