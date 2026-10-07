import { describe, expect, test } from "vitest";

import * as Ast from "#ast";
import { Type } from "#types";
import { parse } from "#parser";
import { Severity } from "#result";

import { checkProgram } from "./checker.js";

import "#test/matchers";

describe("Slice type checking", () => {
  test("validates slice of msg.data", () => {
    const result = parse(`
      name Test;
      code {
        let slice = msg.data[0:4];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = checkProgram(result.value);
    expect(typeResult.success).toBe(true);

    if (typeResult.success) {
      const { types } = typeResult.value;
      const program = result.value;
      const statement = program.body?.items[0];
      if (Ast.isStatement(statement) && Ast.Statement.isDeclare(statement)) {
        const decl = statement.declaration;
        if (!Ast.Declaration.isVariable(decl) || !decl.initializer) {
          throw new Error("Expected initializer");
        }
        const sliceType = types.get(decl.initializer.id);
        if (!sliceType) {
          throw new Error("Unexpected missing slice type");
        }
        expect(Type.format(sliceType)).toBe("bytes calldata");
      }
    }
  });

  /** The type of each `let` in a program's `code` block, by name */
  function letTypes(source: string): Record<string, string> {
    const result = parse(source);
    if (!result.success) throw new Error("Parse failed");
    const typeResult = checkProgram(result.value);
    if (!typeResult.success) throw new Error("Type check failed");
    const { types } = typeResult.value;
    const lets: Record<string, string> = {};
    for (const item of result.value.body?.items ?? []) {
      if (Ast.isStatement(item) && Ast.Statement.isDeclare(item)) {
        const decl = item.declaration;
        lets[decl.name] = Type.format(types.get(decl.id)!);
      }
    }
    return lets;
  }

  test("keeps a slice of calldata in calldata, unless typed", () => {
    expect(
      letTypes(`
      name Test;
      code {
        let a = msg.data[4:36];
        let b: bytes = msg.data[4:36];
        let c = b[1:3];
        let m: bytes = 0x${"12".repeat(33)};
        let d = m[0:1];
        let e = b as bytes;
      }
    `),
    ).toEqual({
      a: "bytes calldata",
      b: "bytes",
      c: "bytes",
      m: "bytes",
      d: "bytes",
      e: "bytes",
    });
  });

  test("copies calldata bytes to memory bytes, never writes calldata", () => {
    const result = parse(`
      name Test;
      code {
        let m: bytes = 0x${"12".repeat(33)};
        let c = msg.data[4:36];
        m = c;
        c = m;
        c[0] = 1;
      }
    `);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = checkProgram(result.value);
    expect(typeResult.success).toBe(false);
    expect(typeResult.messages[Severity.Error]).toHaveLength(2);
    expect(typeResult).toHaveMessage({
      severity: Severity.Error,
      message: "Type mismatch: expected bytes calldata, got bytes",
    });
    expect(typeResult).toHaveMessage({
      severity: Severity.Error,
      message: "Cannot assign to bytes in calldata",
    });
  });

  test("rejects slice of non-bytes type", () => {
    const result = parse(`
      name Test;
      storage {
        [0] numbers: array<uint256, 10>;
      }
      code {
        let slice = numbers[0:4];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = checkProgram(result.value);
    expect(typeResult.success).toBe(false);
    expect(typeResult).toHaveMessage({
      severity: Severity.Error,
      message: "Cannot slice",
    });
  });

  test("validates slice indices are numeric", () => {
    const result = parse(`
      name Test;
      code {
        let slice = msg.data["start":"end"];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = checkProgram(result.value);
    expect(typeResult.success).toBe(false);
    expect(typeResult).toHaveMessage({
      severity: Severity.Error,
      message: "Slice start index must be numeric",
    });
    expect(typeResult).toHaveMessage({
      severity: Severity.Error,
      message: "Slice end index must be numeric",
    });
  });
});
