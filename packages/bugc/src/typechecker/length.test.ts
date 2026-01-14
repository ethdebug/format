import { describe, expect, it } from "vitest";

import { parse } from "#parser";
import { Result, Severity } from "#result";

import { checkProgram } from "./checker.js";

import "#test/matchers";

describe("TypeChecker - Length Property", () => {
  it("should type check array.length", () => {
    const source = `
      name ArrayLength;

      storage {
        [0] arr: array<uint256, 10>;
        [1] len: uint256;
      }

      code {
        len = arr.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should type check msg.data.length", () => {
    const source = `
      name DataLength;

      storage {
        [0] dataSize: uint256;
      }

      code {
        dataSize = msg.data.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should type check length in conditions", () => {
    const source = `
      name LengthCondition;

      storage {
        [0] arr: array<address, 5>;
        [1] hasElements: bool;
      }

      code {
        if (arr.length > 0) {
          hasElements = true;
        }

        if (msg.data.length >= 4) {
          hasElements = true;
        }
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should type check length in loops", () => {
    const source = `
      name LengthLoop;

      storage {
        [0] arr: array<uint256, 20>;
      }

      code {
        for (let i = 0; i < arr.length; i = i + 1) {
          arr[i] = i;
        }
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should type check string.length", () => {
    const source = `
      name StringLength;

      define {
        function getStringLen(s: string) -> uint256 {
          return s.length;
        };
      }

      code {
        let len = getStringLen("hello");
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should fail on length of non-array/bytes/string types", () => {
    const source = `
      name InvalidLength;

      storage {
        [0] num: uint256;
      }

      code {
        let len = num.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(Result.hasErrors(result)).toBe(true);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "does not have a length property",
      });
    }
  });

  it("should fail on length of address type", () => {
    const source = `
      name AddressLength;

      code {
        let len = msg.sender.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(Result.hasErrors(result)).toBe(true);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "does not have a length property",
      });
    }
  });

  it("should fail on length of mapping type", () => {
    const source = `
      name MappingLength;

      storage {
        [0] balances: mapping<address, uint256>;
      }

      code {
        let len = balances.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(Result.hasErrors(result)).toBe(true);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "does not have a length property",
      });
    }
  });

  it("should type check nested array length", () => {
    const source = `
      name NestedArrayLength;

      storage {
        [0] matrix: array<array<uint256, 10>, 5>;
        [1] rowCount: uint256;
        [2] colCount: uint256;
      }

      code {
        rowCount = matrix.length;  // Should be 5
        colCount = matrix[0].length;  // Should be 10
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });

  it("should type check bytes type length variations", () => {
    const source = `
      name BytesLengthVariations;

      storage {
        [0] fixedBytes: bytes32;
        [1] len1: uint256;
        [2] len2: uint256;
      }

      code {
        // Dynamic bytes (msg.data)
        len1 = msg.data.length;

        // Fixed bytes don't have .length in our implementation
        // This would need to be handled differently if we want to support it
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const result = checkProgram(ast.value);
    expect(result.success).toBe(true);
  });
});
