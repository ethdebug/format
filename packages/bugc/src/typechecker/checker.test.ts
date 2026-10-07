import { describe, it, expect } from "vitest";

import { parse } from "#parser";
import { Result, Severity } from "#result";
import { Type, type Types } from "#types";

import { checkProgram } from "./checker.js";
import type { Error as BugTypeError } from "./errors.js";

import "#test/matchers";

describe("checkProgram", () => {
  function check(source: string): Result<Types, BugTypeError> {
    const parseResult = parse(source);
    if (!parseResult.success) {
      const firstError = Result.firstError(parseResult);
      throw new Error(`Parse error: ${firstError?.message || "Unknown error"}`);
    }
    const ast = parseResult.value;
    const result = checkProgram(ast);
    return Result.map(result, ({ types }) => types);
  }

  describe("Variable Declarations", () => {
    it("should type check variable declarations", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 42;
          let y = true;
          let z = "hello";
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
      // Variables are local to the code block and not accessible after type checking
    });

    it("should report error for undefined variables", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          x = 42;
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Undefined variable: x",
      });
    });
  });

  describe("Type Assignments", () => {
    it("should allow numeric assignments", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 42;
          x = 100;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should report type mismatch", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 42;
          x = true;
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Type mismatch",
      });
    });
  });

  describe("Operators", () => {
    it("should type check arithmetic operators", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 10 + 20;
          let y = x * 2;
          let z = y - x;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check the modulo operator", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 10 % 3;
          let y = x % 2;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should reject the modulo operator on non-numeric operands", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = true % 3;
        }
      `);

      expect(result.success).toBe(false);
    });

    it("should type check comparison operators", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 10;
          let b1 = x > 5;
          let b2 = x <= 20;
          let b3 = x == 10;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check logical operators", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let a = true;
          let b = false;
          let c = a && b;
          let d = a || b;
          let e = !a;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should report operator type errors", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = true + false;
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "requires numeric operands",
      });
    });
  });

  describe("Integer literals and signedness", () => {
    const program = (body: string) => `
      name Test;
      storage { [0] n: int8; [1] u: uint256; }
      code { let x = n; ${body} }
    `;

    for (const body of [
      "let a = x < 0;",
      "let b = x == 1;",
      "let c = -1 < x;",
      "let d = x + 1;",
      "let e = x / -2;",
      "let f = x != -128;",
      "let g = u > 0;",
    ]) {
      it(`should give a literal the other operand's type: \`${body}\``, () => {
        const result = check(program(body));
        expect(result.success).toBe(true);
        expect(Result.hasMessages(result)).toBe(false);
      });
    }

    for (const [body, message] of [
      ["let a = x < 128;", "Literal 128 does not fit in int8"],
      ["let b = x == -129;", "Literal -129 does not fit in int8"],
      ["let c = u > -1;", "Literal -1 does not fit in uint256"],
    ]) {
      it(`should reject a literal that does not fit: \`${body}\``, () => {
        const result = check(program(body));
        expect(result.success).toBe(false);
        expect(result).toHaveMessage({ severity: Severity.Error, message });
      });
    }

    for (const body of [
      "let a = u > x;",
      "let b = x <= u;",
      "let c = x + u;",
      "let d = u / x;",
      "let e = u % x;",
    ]) {
      it(`should reject mixed signedness: \`${body}\``, () => {
        const result = check(program(body));
        expect(result.success).toBe(false);
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: "cannot mix signed and unsigned operands",
        });
      });
    }
  });

  describe("Structs", () => {
    it("should type check struct field access", () => {
      const result = check(`
        name Test;
        define {
          struct Point {
            x: uint256;
            y: uint256;
          };
        }
        storage {
          [0] point: Point;
        }
        code {
          let x = point.x;
          point.y = 100;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should report undefined struct fields", () => {
      const result = check(`
        name Test;
        define {
          struct Point {
            x: uint256;
            y: uint256;
          };
        }
        storage {
          [0] point: Point;
        }
        code {
          let z = point.z;
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "has no field z",
      });
    });
  });

  describe("Arrays and Mappings", () => {
    it("should type check array access", () => {
      const result = check(`
        name Test;
        storage {
          [0] nums: array<uint256>;
        }
        code {
          let x = nums[0];
          nums[1] = 42;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check mapping access", () => {
      const result = check(`
        name Test;
        storage {
          [0] balances: mapping<address, uint256>;
        }
        code {
          let addr = 0x1234567890123456789012345678901234567890;
          let bal = balances[addr];
          balances[addr] = 100;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should report invalid array index type", () => {
      const result = check(`
        name Test;
        storage {
          [0] nums: array<uint256>;
        }
        code {
          let x = nums[true];
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Array index must be numeric",
      });
    });

    it("should reject a signed index", () => {
      const programs: Record<string, [string, string]> = {
        "an array read": ["let x = a[i];", "Array index"],
        "an array write": ["a[i] = 1;", "Array index"],
        "a bytes read": ["let x = b[i];", "Bytes index"],
        "a bytes write": ["b[i] = 1 as uint8;", "Bytes index"],
        "a slice start": ["let x = b[i:2];", "Slice start index"],
        "a slice end": ["let x = b[0:i];", "Slice end index"],
      };

      for (const [name, [statement, what]] of Object.entries(programs)) {
        const result = check(`
          name Test;
          code {
            let a: array<uint256> = [1, 2, 3];
            let b = msg.data[0:3];
            let i: int256 = 1 as int256;
            ${statement}
          }
        `);

        expect(result.success, name).toBe(false);
        expect(Result.countErrors(result), name).toBe(1);
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message:
            `${what} must be an unsigned integer, not int256; ` +
            "cast it, as in `i as uint256`",
        });
      }
    });
  });

  describe("Control Flow", () => {
    it("should type check if statements", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let x = 10;
          if (x > 5) {
            x = 20;
          } else {
            x = 0;
          }
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check for loops", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          let sum = 0;
          for (let i = 0; i < 10; i = i + 1) {
            sum = sum + i;
          }
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should report non-boolean conditions", () => {
      const result = check(`
        name Test;
        storage {}
        code {
          if (42) {
            let x = 1;
          }
        }
      `);

      expect(result.success).toBe(false);
      expect(Result.countErrors(result)).toBe(1);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "condition must be boolean",
      });
    });
  });

  describe("Special Expressions", () => {
    it("should type check msg.sender", () => {
      const result = check(`
        name Test;
        storage {
          [0] owner: address;
        }
        code {
          owner = msg.sender;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check msg.value", () => {
      const result = check(`
        name Test;
        storage {
          [0] balance: uint256;
        }
        code {
          balance = balance + msg.value;
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });

    it("should type check msg.data", () => {
      const result = check(`
        name Test;
        storage {
          [0] calldataHash: bytes32;
        }
        code {
          let data = msg.data;
          // Note: bytes type is dynamic, can be used in let statements
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });
  });

  describe("Complex Programs", () => {
    it("should type check complete program", () => {
      const result = check(`
        name SimpleStorage;

        define {
          struct User {
            addr: address;
            balance: uint256;
          };
        }

        storage {
          [0] owner: address;
          [1] users: mapping<address, User>;
          [2] totalSupply: uint256;
        }

        code {
          let sender = msg.sender;

          if (sender == owner) {
            let user = users[sender];
            user.balance = user.balance + msg.value;
            totalSupply = totalSupply + msg.value;
          }
        }
      `);

      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });
  });

  describe("Postfix chains", () => {
    it("should give each node of a chain its own type", () => {
      const result = check(`
        name Test;
        define {
          function f() -> uint256 { return 300; };
        }
        storage { [0] v: uint256; [1] a: uint256; [2] b: uint256; }
        code {
          a = v as int8 as int256 as uint256;
          b = f() as uint8 as uint256;
        }
      `);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const formatted = new Set(
        [...result.value.values()].map((type) => Type.format(type)),
      );
      for (const name of ["int8", "int256", "uint8", "uint256"]) {
        expect(formatted).toContain(name);
      }

      // No two chain nodes share an id, so no type is overwritten
      const ids = [...result.value.keys()];
      expect(ids).not.toContain("0_0");
    });
  });

  describe("Casts from dynamic bytes", () => {
    const program = (expression: string) => `
      name Test;
      storage { [0] a: uint256; }
      code { let x = ${expression}; }
    `;

    for (const target of ["uint32", "int8", "uint256", "address"]) {
      it(`should reject bytes to ${target}`, () => {
        const result = check(program(`msg.data[0:4] as ${target}`));

        expect(result.success).toBe(false);
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: `Cannot cast from bytes to ${target}: cast to a fixed-size bytes type first`,
        });
      });
    }

    it("should allow bytes to an integer via bytesN", () => {
      const result = check(program("msg.data[0:4] as bytes4 as uint32"));

      expect(result.success).toBe(true);
    });
  });
  describe("Missing return", () => {
    function checkFunction(body: string, returnType = " -> uint256") {
      return check(`
        name Test;
        define {
          function f(x: uint256)${returnType} {
            ${body}
          };
        }
        storage {}
        code {}
      `);
    }

    const accepted: Record<string, string> = {
      "a return at the end": "return x;",
      "statements after a return": "return x; x = 1;",
      "an if/else where both branches return":
        "if (x > 1) { return 1; } else { return 2; }",
      "nested if/else where every path returns": `
        if (x > 1) {
          if (x > 2) { return 3; } else { return 2; }
        } else {
          return 1;
        }`,
      "an early return then a final return": `
        if (x > 1) { return 1; }
        return 2;`,
      "a return after a loop": `
        for (let i = 0; i < x; i = i + 1) { x = x + 1; }
        return x;`,
    };

    for (const [name, body] of Object.entries(accepted)) {
      it(`should accept ${name}`, () => {
        const result = checkFunction(body);
        expect(result.success).toBe(true);
        expect(Result.hasMessages(result)).toBe(false);
      });
    }

    const rejected: Record<string, string> = {
      "an empty body": "",
      "a body without a return": "x = x + 1;",
      "an early return in one branch only": "if (x > 1) { return 1; }",
      "an if/else where one branch falls through":
        "if (x > 1) { return 1; } else { x = 2; }",
      "nested if/else with a path that falls through": `
        if (x > 1) {
          if (x > 2) { return 3; }
        } else {
          return 1;
        }`,
      "a return only inside a loop": `
        for (let i = 0; i < x; i = i + 1) { return i; }`,
    };

    for (const [name, body] of Object.entries(rejected)) {
      it(`should reject ${name}`, () => {
        const result = checkFunction(body);
        expect(result.success).toBe(false);
        expect(Result.countErrors(result)).toBe(1);
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message:
            "Missing return: function f returns uint256, " +
            "but its body can end without a return",
        });
      });
    }

    it("should accept a void function without a return", () => {
      const result = checkFunction("x = x + 1;", "");
      expect(result.success).toBe(true);
      expect(Result.hasMessages(result)).toBe(false);
    });
  });
  describe("keccak256", () => {
    const program = (expression: string) => `
      name Test;
      storage { [0] h: bytes32; }
      code {
        let n: uint256 = 1;
        let s = "x";
        h = ${expression};
      }
    `;

    const accepted = {
      "one string": `keccak256("x")`,
      "one dynamic bytes": `keccak256(msg.data)`,
      "one value type": `keccak256(n)`,
      "several value types": `keccak256(n, msg.sender, true, h, 0x01)`,
    };
    for (const [name, expression] of Object.entries(accepted)) {
      it(`should accept ${name}`, () => {
        const result = check(program(expression));
        expect(result.success).toBe(true);
      });
    }

    const rejected = {
      "no arguments": [`keccak256()`, "keccak256 expects at least 1 argument"],
      "a string among several arguments": [
        `keccak256(n, s)`,
        "keccak256 of several arguments takes only value types; " +
          "bytes or string must be its only argument",
      ],
      "dynamic bytes among several arguments": [
        `keccak256(msg.data, n)`,
        "keccak256 of several arguments takes only value types; " +
          "bytes or string must be its only argument",
      ],
    };
    for (const [name, [expression, message]] of Object.entries(rejected)) {
      it(`should reject ${name}`, () => {
        const result = check(program(expression));
        expect(result.success).toBe(false);
        expect(result).toHaveMessage({ severity: Severity.Error, message });
      });
    }
  });
});
