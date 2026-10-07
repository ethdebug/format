import { describe, expect, test } from "vitest";

import * as Ast from "#ast";

import { parse } from "./parser.js";

describe("Slice expressions", () => {
  test("parses simple slice syntax", () => {
    const result = parse(`
      name Test;
      code {
        data[0:4];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Parse failed");
    }
    const program = result.value;
    const exprStmt = program.body?.items[0];
    expect(exprStmt?.kind).toBe("statement:express");

    if (exprStmt?.kind === "statement:express") {
      const slice = (exprStmt as Ast.Statement.Express)
        .expression as Ast.Expression.Access;
      if (!Ast.Expression.Access.isSlice(slice)) {
        throw new Error("Expected slice access");
      }

      expect(slice.kind).toBe("expression:access:slice");
      expect(slice.start).toMatchObject({
        kind: "expression:literal:number",
        value: "0",
      });
      expect(slice.end).toMatchObject({
        kind: "expression:literal:number",
        value: "4",
      });
    }
  });

  test("parses slice with complex expressions", () => {
    const result = parse(`
      name Test;
      code {
        msg.data[offset:offset + 32];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");
    const program = result.value;
    const exprStmt = program.body?.items[0];

    if (exprStmt?.kind === "statement:express") {
      const slice = (exprStmt as Ast.Statement.Express)
        .expression as Ast.Expression.Access;
      expect(slice.kind).toBe("expression:access:slice");
      expect(slice.object).toMatchObject({
        kind: "expression:special:msg.data",
      });
    }
  });

  test("distinguishes slice from index access", () => {
    const result = parse(`
      name Test;
      code {
        data[5];
        data[0:5];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");
    const program = result.value;

    const indexedStmt = program.body?.items[0];
    const slicedStmt = program.body?.items[1];

    if (
      indexedStmt?.kind === "statement:express" &&
      slicedStmt?.kind === "statement:express"
    ) {
      const indexed = (indexedStmt as Ast.Statement.Express)
        .expression as Ast.Expression.Access;
      const sliced = (slicedStmt as Ast.Statement.Express)
        .expression as Ast.Expression.Access;

      expect(indexed.kind).toBe("expression:access:index");
      expect(sliced.kind).toBe("expression:access:slice");
    }
  });

  test("parses `bytes calldata` as a type", () => {
    const result = parse(`
      name Test;
      code {
        let t: bytes calldata = msg.data[0:4];
        let u = t as bytes calldata;
        let m: bytes = t;
        let calldata = 1;
      }
    `);
    if (!result.success) throw new Error("Parse failed");

    const types = (result.value.body?.items ?? []).map((item) => {
      const decl = (item as Ast.Statement.Declare).declaration;
      const { initializer, type } = decl as Ast.Declaration.Variable;
      return Ast.Expression.isCast(initializer!)
        ? initializer.targetType
        : type;
    });
    expect(types).toMatchObject([
      { kind: "type:elementary:bytes", location: "calldata" },
      { kind: "type:elementary:bytes", location: "calldata" },
      { kind: "type:elementary:bytes" },
      undefined,
    ]);
    expect(types[2]).not.toHaveProperty("location");
  });
});
