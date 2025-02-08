import { expect, describe, it } from "@jest/globals";

import { describeSchema } from "../../describe";

import { Type, isType } from "./index";

describe("type guards", () => {
  const schemaGuards = [
    {
      schema: "schema:ethdebug/format/type",
      guard: isType
    },

    // elementary types

    {
      schema: "schema:ethdebug/format/type/elementary",
      guard: Type.isElementary
    },
    {
      schema: "schema:ethdebug/format/type/elementary/uint",
      guard: Type.Elementary.isUint
    },
    {
      schema: "schema:ethdebug/format/type/elementary/int",
      guard: Type.Elementary.isInt
    },
    {
      schema: "schema:ethdebug/format/type/elementary/ufixed",
      guard: Type.Elementary.isUfixed
    },
    {
      schema: "schema:ethdebug/format/type/elementary/fixed",
      guard: Type.Elementary.isFixed
    },
    {
      schema: "schema:ethdebug/format/type/elementary/bool",
      guard: Type.Elementary.isBool
    },
    {
      schema: "schema:ethdebug/format/type/elementary/bytes",
      guard: Type.Elementary.isBytes
    },
    {
      schema: "schema:ethdebug/format/type/elementary/string",
      guard: Type.Elementary.isString
    },
    {
      schema: "schema:ethdebug/format/type/elementary/address",
      guard: Type.Elementary.isAddress
    },
    {
      schema: "schema:ethdebug/format/type/elementary/contract",
      guard: Type.Elementary.isContract
    },
    {
      schema: "schema:ethdebug/format/type/elementary/enum",
      guard: Type.Elementary.isEnum
    },

    // complex types

    {
      schema: "schema:ethdebug/format/type/complex",
      guard: Type.isComplex
    },
    {
      schema: "schema:ethdebug/format/type/complex/alias",
      guard: Type.Complex.isAlias
    },
    {
      schema: "schema:ethdebug/format/type/complex/tuple",
      guard: Type.Complex.isTuple
    },
    {
      schema: "schema:ethdebug/format/type/complex/array",
      guard: Type.Complex.isArray
    },
    {
      schema: "schema:ethdebug/format/type/complex/mapping",
      guard: Type.Complex.isMapping
    },
    {
      schema: "schema:ethdebug/format/type/complex/struct",
      guard: Type.Complex.isStruct
    },
  ] as const;

  for (const { guard, ...describeSchemaOptions } of schemaGuards) {
    const { schema } = describeSchemaOptions;
    describe(schema.slice("schema:".length), () => {
      it("matches its examples", () => {
        const {
          schema: {
            examples = []
          }
        } = describeSchema(describeSchemaOptions);

        expect(guard).toSatisfyAll(examples);
      });
    });
  }
});
