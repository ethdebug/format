import { describe, it, expect } from "vitest";

import { testSchemaGuards } from "#test/guards";
import { describeSchema } from "#describe";

import { Pointer, isPointer } from "./pointer.js";

const identifierSchema = "schema:ethdebug/format/pointer/identifier";

describe("Pointer.isIdentifier", () => {
  const valid = ["a", "a0", "-$", "__init__", "_x", "A", "foo-bar", "x$y"];

  const invalid = [
    "", // empty
    "0abc", // leading digit
    "$x", // leading $
    "a b", // space
    "foo\\bar", // embedded backslash — accepted before the fix
    "\\", // lone backslash
    "foo\tbar", // tab
    "café", // non-ASCII letter
  ];

  it.each(valid)("accepts %j", (value) => {
    expect(Pointer.isIdentifier(value)).toBe(true);
  });

  it.each(invalid)("rejects %j", (value) => {
    expect(Pointer.isIdentifier(value)).toBe(false);
  });

  it("agrees with the identifier schema pattern over a corpus", () => {
    const { schema } = describeSchema({ schema: identifierSchema });
    const { pattern } = schema as { pattern: string };
    const schemaRegex = new RegExp(pattern);

    for (const value of [...valid, ...invalid]) {
      expect(Pointer.isIdentifier(value)).toBe(schemaRegex.test(value));
    }
  });

  it("rejects non-string inputs", () => {
    for (const value of [undefined, null, 42, {}, ["a"]]) {
      expect(Pointer.isIdentifier(value)).toBe(false);
    }
  });
});

const expressionSchema = "schema:ethdebug/format/pointer/expression";
testSchemaGuards("ethdebug/format/pointer", [
  {
    schema: identifierSchema,
    guard: Pointer.isIdentifier,
  },
  {
    schema: expressionSchema,
    guard: Pointer.isExpression,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Literal",
    guard: Pointer.Expression.isLiteral,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Constant",
    guard: Pointer.Expression.isConstant,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Variable",
    guard: Pointer.Expression.isVariable,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Arithmetic",
    guard: Pointer.Expression.isArithmetic,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Lookup",
    guard: Pointer.Expression.isLookup,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Read",
    guard: Pointer.Expression.isRead,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Reference",
    guard: Pointer.Expression.isReference,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Keccak256",
    guard: Pointer.Expression.isKeccak256,
  },
  {
    schema: expressionSchema,
    pointer: "#/$defs/Resize",
    guard: Pointer.Expression.isResize,
  },
  {
    schema: "schema:ethdebug/format/pointer/region",
    guard: Pointer.isRegion,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/stack",
    guard: Pointer.Region.isStack,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/memory",
    guard: Pointer.Region.isMemory,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/storage",
    guard: Pointer.Region.isStorage,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/calldata",
    guard: Pointer.Region.isCalldata,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/returndata",
    guard: Pointer.Region.isReturndata,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/transient",
    guard: Pointer.Region.isTransient,
  },
  {
    schema: "schema:ethdebug/format/pointer/region/code",
    guard: Pointer.Region.isCode,
  },
  {
    schema: "schema:ethdebug/format/pointer/collection/group",
    guard: Pointer.Collection.isGroup,
  },
  {
    schema: "schema:ethdebug/format/pointer/collection/list",
    guard: Pointer.Collection.isList,
  },
  {
    schema: "schema:ethdebug/format/pointer",
    guard: isPointer,
  },
  {
    schema: "schema:ethdebug/format/pointer/template",
    guard: Pointer.isTemplate,
  },
] as const);
