import { describe, it, expect } from "vitest";

import { parse } from "#parser";
import { Result, Severity } from "#result";
import type { Types } from "#types";

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
});
