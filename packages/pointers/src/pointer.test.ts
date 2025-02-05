import { expect, describe, it } from "@jest/globals";
import chalk from "chalk";

import { describeSchema } from "@ethdebug/format";

import { Pointer, isPointer } from "./index.js";


describe("type guards", () => {
  const expressionSchema = {
    id: "schema:ethdebug/format/pointer/expression"
  };

  const schemaGuards = [
    {
      schema: expressionSchema,
      guard: Pointer.isExpression
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Literal",
      guard: Pointer.Expression.isLiteral
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Constant",
      guard: Pointer.Expression.isConstant
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Variable",
      guard: Pointer.Expression.isVariable
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Arithmetic",
      guard: Pointer.Expression.isArithmetic
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Lookup",
      guard: Pointer.Expression.isLookup
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Read",
      guard: Pointer.Expression.isRead
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Reference",
      guard: Pointer.Expression.isReference
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Keccak256",
      guard: Pointer.Expression.isKeccak256
    },
    {
      schema: expressionSchema,
      pointer: "#/$defs/Resize",
      guard: Pointer.Expression.isResize
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region"
      },
      guard: Pointer.isRegion
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/stack"
      },
      guard: Pointer.Region.isStack
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/memory"
      },
      guard: Pointer.Region.isMemory
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/storage"
      },
      guard: Pointer.Region.isStorage
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/calldata"
      },
      guard: Pointer.Region.isCalldata
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/returndata"
      },
      guard: Pointer.Region.isReturndata
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/transient"
      },
      guard: Pointer.Region.isTransient
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/region/code"
      },
      guard: Pointer.Region.isCode
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/collection/group"
      },
      guard: Pointer.Collection.isGroup
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/collection/list"
      },
      guard: Pointer.Collection.isList
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer"
      },
      guard: isPointer
    },
    {
      schema: {
        id: "schema:ethdebug/format/pointer/template"
      },
      guard: Pointer.isTemplate
    },
  ] as const;

  it.each(schemaGuards)("matches its examples", ({
    guard,
    ...describeSchemaOptions
  }) => {
    const { schema: { examples = [] } } = describeSchema(describeSchemaOptions);

    expect(guard).toSatisfyAll(examples);
  });
});
