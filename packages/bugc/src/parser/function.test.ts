import { describe, it, expect } from "vitest";
import type * as Ast from "#ast";
import { Severity } from "#result";
import { parse } from "./parser.js";
import "#test/matchers";

describe("Function declarations", () => {
  it("parses function with parameters and return type", () => {
    if (!parse) {
      throw new Error("parse function is not imported");
    }
    const input = `
      name FunctionTest;

      define {
        function add(a: uint256, b: uint256) -> uint256 {
          return a + b;
        };
      }

      code {}
    `;

    const result = parse(input);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Parse failed");
    }

    const program = result.value;
    expect(program.definitions?.items).toHaveLength(1);

    const funcDecl = program.definitions!.items[0];
    expect(funcDecl.kind).toBe("declaration:function");
    expect(funcDecl.name).toBe("add");
    const func = funcDecl as Ast.Declaration.Function;
    expect(func.parameters).toHaveLength(2);
    expect(func.parameters[0].name).toBe("a");
    expect(func.parameters[1].name).toBe("b");
    expect(func.returnType?.kind).toBe("type:elementary:uint");
  });

  it("parses void function without return type", () => {
    const input = `
      name VoidFunction;

      define {
        function doSomething(x: uint256) {
          let y = x + 1;
        };
      }

      code {}
    `;

    const result = parse(input);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Parse failed");
    }

    const program = result.value;
    const funcDecl = program.definitions!.items[0];
    expect(funcDecl.kind).toBe("declaration:function");
    expect(funcDecl.name).toBe("doSomething");
    const func = funcDecl as Ast.Declaration.Function;
    expect(func.returnType).toBeUndefined();
  });

  it("parses function calls", () => {
    const input = `
      name CallTest;

      define {
        function multiply(x: uint256, y: uint256) -> uint256 {
          return x * y;
        };
      }

      code {
        let result = multiply(10, 20);
      }
    `;

    const result = parse(input);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Parse failed");
    }

    const program = result.value;
    const codeBlock = program.body;
    const letStmt = codeBlock?.items[0];

    expect(letStmt?.kind).toBe("statement:declare");
    if (letStmt?.kind === "statement:declare") {
      const decl = (letStmt as Ast.Statement.Declare)
        .declaration as Ast.Declaration.Variable;
      const init = decl.initializer;
      expect(init?.kind).toBe("expression:call");
      if (init?.kind === "expression:call") {
        const callExpr = init as Ast.Expression.Call;
        expect(callExpr.callee.kind).toBe("expression:identifier");
        if (callExpr.callee.kind === "expression:identifier") {
          expect((callExpr.callee as Ast.Expression.Identifier).name).toBe(
            "multiply",
          );
        }
        expect(callExpr.arguments).toHaveLength(2);
      }
    }
  });

  it("rejects function as identifier", () => {
    const input = `
      name BadIdentifier;
      code {
        let function = 5;
      }
    `;

    const result = parse(input);
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "function",
      });
    }
  });
});
