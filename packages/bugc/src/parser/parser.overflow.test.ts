import { describe, expect, it } from "vitest";
import { parse } from "./parser.js";
import type * as Ast from "#ast";
import { Result, Severity } from "#result";
import "#test/matchers";

describe("Parser overflow validation", () => {
  describe("Array size validation", () => {
    it("should accept array size at MAX_SAFE_INTEGER", () => {
      const source = `name Test;
storage {
  [0] arr: array<uint256, 9007199254740991>;
}
code {
  arr[0] = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(true);
    });

    it("should reject array size exceeding MAX_SAFE_INTEGER", () => {
      const source = `name Test;
storage {
  [0] arr: array<uint256, 9007199254740992>;
}
code {
  arr[0] = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: "exceeds maximum safe integer",
        });
      }
    });

    it("should reject negative array size", () => {
      const source = `name Test;
storage {
  [0] arr: array<uint256, -5>;
}
code {
  arr[0] = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(false);
      // Negative numbers won't match the numberString parser, so we get a different error
      if (!result.success) {
        expect(Result.hasErrors(result)).toBe(true);
      }
    });

    it("should reject zero array size", () => {
      const source = `name Test;
storage {
  [0] arr: array<uint256, 0>;
}
code {
  arr[0] = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: "Array size must be positive",
        });
      }
    });
  });

  describe("Storage slot validation", () => {
    it("should accept storage slot at MAX_SAFE_INTEGER", () => {
      const source = `name Test;
storage {
  [9007199254740991] a: uint256;
}
code {
  a = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(true);
    });

    it("should reject storage slot exceeding MAX_SAFE_INTEGER", () => {
      const source = `name Test;
storage {
  [9007199254740992] a: uint256;
}
code {
  a = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: "exceeds maximum safe integer",
        });
      }
    });

    it("should reject negative storage slot", () => {
      const source = `name Test;
storage {
  [-1] a: uint256;
}
code {
  a = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(false);
      // Negative numbers won't match the numberString parser
      if (!result.success) {
        expect(Result.hasErrors(result)).toBe(true);
      }
    });
  });

  describe("Type validation", () => {
    it("should accept valid uint types", () => {
      const validTypes = [
        "uint8",
        "uint16",
        "uint32",
        "uint64",
        "uint128",
        "uint256",
      ];
      for (const type of validTypes) {
        const source = `name Test;
storage {
  [0] a: ${type};
}
code {
  a = 1;
}`;
        const result = parse(source);
        expect(result.success).toBe(true);
      }
    });

    it("should treat invalid uint types as reference types", () => {
      // Invalid uint types like uint512 are parsed as reference types
      // The type checker will catch them as undefined structs
      const source = `name Test;
storage {
  [0] a: uint512;
}
code {
  a = 1;
}`;
      const result = parse(source);
      expect(result.success).toBe(true); // Parser succeeds

      // Check that it's parsed as a reference type
      if (result.success) {
        const storage = result.value.storage?.find(
          (d) => d.kind === "declaration:storage",
        ) as Ast.Declaration.Storage;
        if (storage) {
          expect(storage.type.kind).toBe("type:reference");
          expect((storage.type as Ast.Type.Reference).name).toBe("uint512");
        }
      }
    });
  });
});
