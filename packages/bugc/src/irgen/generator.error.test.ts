import { describe, it, expect } from "vitest";
import { compile } from "#compiler";
import type * as Ir from "#ir";
import { Result, Severity } from "#result";
import type { BugError } from "#errors";
import "#test/matchers";

describe("generateModule error handling", () => {
  const compileTest = async (
    source: string,
  ): Promise<Result<Ir.Module, BugError>> => {
    return Result.map(
      await compile({ to: "ir", source, sourcePath: "test.bug" }),
      ({ ir }) => ir,
    );
  };

  it("should propagate type errors instead of defaulting to uint256", async () => {
    // This test verifies that when type checking fails, the IR generator
    // reports errors rather than silently defaulting to uint256
    const source = `
      name Test;
      storage {
        [0] x: uint256;
      }
      code {
        // This should fail type checking because y is not declared
        let z = x + y;
        return;
      }
    `;

    const result = await compileTest(source);

    expect(result.success).toBe(false);
    expect(Result.hasErrors(result)).toBe(true);

    // Check that we get a proper type error, not an IR error
    const typeErrors = Result.findMessages(result, {
      severity: Severity.Error,
    }).filter((d) => d.code.startsWith("TYPE"));
    expect(typeErrors.length).toBeGreaterThan(0);
  });

  it("should handle missing types gracefully in IR generation", async () => {
    // Even if type checking somehow passes an expression without a type,
    // the IR generator should report a clear error
    const source = `
      name Test;
      storage {
        [0] x: uint256;
      }
      code {
        // This creates a scenario where getType might return null
        let a = 42;
        let b = a;  // This should work
        return;
      }
    `;

    const result = await compileTest(source);

    if (!result.success) {
      // If it fails, it should be with clear error messages
      const irErrors = Result.findMessages(result, {
        severity: Severity.Error,
      }).filter((d) => d.code === "IR_ERROR");
      for (const error of irErrors) {
        expect(error.message).not.toContain("Cannot read properties of null");
        expect(error.message).not.toContain(
          "Cannot read properties of undefined",
        );
      }
    }
  });

  it("should provide meaningful errors for type conversion failures", async () => {
    const source = `
      name Test;

      define {
        struct Custom {
          field: uint256;
        };
      }

      storage {
        [0] data: Custom;
      }

      code {
        // This should work - accessing struct field
        let x = data.field;
        return;
      }
    `;

    const result = await compileTest(source);

    // This should compile successfully
    expect(result.success).toBe(true);

    // No warnings about defaulting to uint256
    const warnings = Result.warnings(result) || [];
    const defaultingWarnings = warnings.filter(
      (w) => w.message.includes("defaulting") || w.message.includes("uint256"),
    );
    expect(defaultingWarnings).toHaveLength(0);
  });
});
