import { describe, expect, test } from "vitest";

import * as Ast from "#ast";
import { Type } from "#types";
import { parse } from "#parser";
import { Severity } from "#result";

import { checkProgram } from "./checker.js";

import "#test/matchers";

/** The messages of a program's type errors */
const typeErrors = (source: string) => {
  const result = parse(source);
  if (!result.success) throw new Error("Parse failed");
  const typeResult = checkProgram(result.value);
  expect(typeResult.success).toBe(false);
  return (typeResult.messages[Severity.Error] ?? []).map((m) => m.message);
};

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

  test("keeps a slice of calldata in calldata, unless typed bytes", () => {
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
        let f: bytes calldata = msg.data[4:36];
        let g: bytes calldata = f[1:3];
        let h = a as bytes calldata;
        let i = a as bytes;
      }
    `),
    ).toEqual({
      a: "bytes calldata",
      b: "bytes",
      c: "bytes",
      m: "bytes",
      d: "bytes",
      e: "bytes",
      f: "bytes calldata",
      g: "bytes calldata",
      h: "bytes calldata",
      i: "bytes",
    });
  });

  test("allows bytes calldata only as the type of a let or a cast", () => {
    const placement =
      "`bytes calldata` can only be the type of a `let` or a cast";
    const errors = (source: string) => {
      const result = parse(source);
      if (!result.success) throw new Error("Parse failed");
      const typeResult = checkProgram(result.value);
      expect(typeResult.success).toBe(false);
      return (typeResult.messages[Severity.Error] ?? []).map((m) => m.message);
    };

    expect(
      errors(`
      name Test;
      define {
        function f(b: bytes calldata) -> uint256 { return b.length; };
        struct S { b: bytes calldata; };
      }
      code {}
    `),
    ).toEqual([placement, placement]);

    expect(
      errors(`
      name Test;
      storage { [0] s: bytes calldata; }
      code {
        let a: array<bytes calldata> = [msg.data];
        let m: bytes = 0x${"12".repeat(33)};
        let c: bytes calldata = m;
        let d = m as bytes calldata;
      }
    `),
    ).toEqual([
      placement,
      placement,
      "Type mismatch: expected bytes calldata, got bytes",
      "Cannot cast from bytes to bytes calldata",
    ]);
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

describe("String calldata type checking", () => {
  test("types a string in calldata", () => {
    expect(
      letTypes(`
      name Test;
      storage { [0] motd: string; }
      code {
        let a: string calldata = msg.data[4:36] as string calldata;
        let b = a;
        let c = a as string;
        let d: string = a;
        let e = a as bytes calldata;
        let f = e as string calldata;
        let g = a as bytes;
        let n = a.length;
        motd = a;
      }
    `),
    ).toEqual({
      a: "string calldata",
      b: "string calldata",
      c: "string",
      d: "string",
      e: "bytes calldata",
      f: "string calldata",
      g: "bytes",
      n: "uint256",
    });
  });

  test("rejects a string in calldata mixed with bytes or memory", () => {
    const placement =
      "`string calldata` can only be the type of a `let` or a cast";
    expect(
      typeErrors(`
      name Test;
      define {
        function f(s: string calldata) -> uint256 { return s.length; };
      }
      code {}
    `),
    ).toEqual([placement]);

    expect(
      typeErrors(`
      name Test;
      storage { [0] raw: bytes; }
      code {
        let a: string calldata = msg.data[4:36];
        let b: string calldata = msg.data[4:36] as string calldata;
        let m = "hello";
        let c: string calldata = m;
        let d = m as string calldata;
        let e: bytes calldata = b;
        raw = b;
        let x = b[0];
        let y = b[0:1];
      }
    `),
    ).toEqual([
      "Type mismatch: expected string calldata, got bytes calldata",
      "Type mismatch: expected string calldata, got string",
      "Cannot cast from string to string calldata",
      "Type mismatch: expected bytes calldata, got string calldata",
      "Type mismatch: expected bytes, got string calldata",
      "Cannot index string calldata",
      "Cannot slice string calldata - only bytes types can be sliced",
    ]);
  });

  test("rejects comparing or keying a mapping by calldata", () => {
    for (const type of ["string calldata", "bytes calldata"]) {
      const memory = type === "string calldata" ? "string" : "bytes";
      expect(
        typeErrors(`
        name Test;
        storage { [0] m: mapping<${memory}, uint256>; [1] r: bool; }
        code {
          let c: ${type} = msg.data[4:36] as ${type};
          let x: ${memory} = c;
          r = x == c;
          r = c != x;
          m[c] = 1;
          let y = m[c];
          m[x] = 2;
        }
      `),
      ).toEqual([
        `Cannot compare ${type}`,
        `Cannot compare ${type}`,
        `Cannot use ${type} as a mapping key`,
        `Cannot use ${type} as a mapping key`,
      ]);
    }
  });
});
