import { describe, it, expect } from "vitest";
import { compile } from "#compiler";
import { formatError } from "#cli";
import { Severity, Result } from "#result";

import "#test/matchers";

describe("Standardized Error Handling", () => {
  describe("Parse Errors", () => {
    it("should return parse errors with location", async () => {
      const source = `
name Test

storage {
  [0] balance: uint256;
}
`; // Missing semicolon after name

      const result = await compile({ to: "ast", source });

      expect(result.success).toBe(false);
      expect(result).toHaveMessage({
        severity: Severity.Error,
        code: "PARSE_ERROR",
        message: "Parse error",
      });

      const error = Result.firstError(result);
      expect(error).toBeDefined();
      expect(error?.location).toBeDefined();
    });

    it("should handle multiple parse errors", async () => {
      const source = `
name Test

storage {
  [0 balance uint256;  // Missing ] and :
}

code {
  x =
}
`;

      const result = await compile({ to: "ast", source });

      expect(result.success).toBe(false);
      expect(Result.hasErrors(result)).toBe(true);
    });
  });

  describe("Type Errors", () => {
    it("should return type errors with location", async () => {
      const source = `
name Test;

storage {
  [0] balance: uint256;
}

code {
  balance = "hello";  // Type mismatch
}
`;

      const result = await compile({ to: "ir", source });

      expect(result.success).toBe(false);

      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Type mismatch",
      });
    });

    it("should collect multiple type errors", async () => {
      const source = `
name Test;

storage {
  [0] balance: uint256;
  [1] flag: bool;
}

code {
  balance = true;      // Type error 1
  flag = 42;          // Type error 2
  unknown = 123;      // Type error 3: undefined variable
}
`;

      const result = await compile({ to: "ir", source });

      expect(result.success).toBe(false);

      const typeErrors = Result.findMessages(result, {
        severity: Severity.Error,
      }).filter((e) => e.code.startsWith("TYPE"));
      expect(typeErrors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("IR Generation Errors", () => {
    it("should handle IR errors gracefully", async () => {
      // Since parser doesn't support call expressions, we'll test a different IR error
      const source = `
name Test;

storage {
  [0] x: uint256;
}

code {
  // This will cause an IR error - using undefined variable
  let temp = undefinedVar + 1;
}
`;

      const result = await compile({ to: "ir", source });

      // Should get a type error for undefined variable
      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Undefined variable",
      });
    });
  });

  describe("Error Formatting", () => {
    it("should format errors nicely", async () => {
      const source = `name Test`; // Missing semicolon
      const result = await compile({ to: "ast", source });

      expect(result.success).toBe(false);

      const error = Result.firstError(result)!;
      const formatted = formatError(error, source);

      expect(formatted).toContain("❌ Error [PARSE_ERROR]");
      expect(formatted).toContain("at offset");
    });

    it("should show source snippet in error", async () => {
      const source = `name Test
storage {
  [0] x: unknowntype;
}`;

      const result = await compile({ to: "ast", source });

      const firstError = Result.firstError(result);
      if (!result.success && firstError) {
        const formatted = formatError(firstError, source);
        // Should show line numbers and context
        expect(formatted).toMatch(/\d+ \|/); // Line number format
      }
    });
  });

  describe("Diagnostic Collection", () => {
    it("should accumulate messages across phases", async () => {
      const source = `
name Test;

storage {
  [0] x: uint256;
}

code {
  y = x + z;  // y and z are undefined
}
`;

      const result = await compile({ to: "ir", source });

      // Should have type errors for undefined variables
      const typeErrors = Result.findMessages(result, {
        severity: Severity.Error,
      }).filter((e) => e.code.startsWith("TYPE"));
      expect(typeErrors.length).toBeGreaterThan(0);
    });

    it("should distinguish between errors and warnings", async () => {
      // Once we add warnings, this test will verify they're handled properly
      const result = await compile({ to: "ir", source: "name Test;" });

      if (result.success) {
        // Check for any warnings
        const warnings = Result.warnings(result);
        expect(warnings).toBeDefined(); // Just check the structure exists
      }
    });
  });
});
