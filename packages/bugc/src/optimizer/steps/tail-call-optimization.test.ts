import { describe, it, expect } from "vitest";

import * as Irgen from "#irgen";
import { parse } from "#parser";
import { Result } from "#result";
import * as TypeChecker from "#typechecker";

import { TailCallOptimizationStep } from "./tail-call-optimization.js";
import { OptimizationContextImpl } from "../optimizer.js";

describe("TailCallOptimizationStep", () => {
  it("optimizes simple tail-recursive factorial", () => {
    const source = `
      name TestTailRecursion;

      define {
        function factorial(n: uint256, acc: uint256) -> uint256 {
          if (n == 0) {
            return acc;
          }
          return factorial(n - 1, acc * n);
        };
      }

      code {
        return;
      }
    `;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        "Parse failed: " +
          (Result.firstError(parseResult)?.message || "Unknown error"),
      );
    }

    const typeResult = TypeChecker.checkProgram(parseResult.value);
    if (!typeResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeResult)?.message || "Unknown error"),
      );
    }

    // Build IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeResult.value.types,
    );
    if (!irResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(irResult)?.message || "Unknown error"),
      );
    }

    const module = irResult.value;
    const factorialFunc = module.functions.get("factorial")!;

    // Count call terminators before optimization
    let callsBeforeCount = 0;
    for (const [, block] of factorialFunc.blocks) {
      if (block.terminator.kind === "call") {
        callsBeforeCount++;
      }
    }

    // Should have at least one call before optimization
    expect(callsBeforeCount).toBeGreaterThan(0);

    // Apply tail call optimization
    const pass = new TailCallOptimizationStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("factorial")!;

    // Count call terminators after optimization
    let callsAfterCount = 0;
    let hasLoopHeader = false;

    for (const [blockId, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "call") {
        callsAfterCount++;
      }
      // Look for the loop header block
      if (blockId.includes("_loop")) {
        hasLoopHeader = true;
        // Loop header should have phi nodes for parameters
        expect(block.phis.length).toBe(factorialFunc.parameters.length);
      }
    }

    // Tail-recursive calls should be eliminated
    expect(callsAfterCount).toBe(0);

    // Should have created a loop header
    expect(hasLoopHeader).toBe(true);

    // Should have recorded transformations
    const transformations = context.getTransformations();
    expect(transformations.length).toBeGreaterThan(0);
    expect(
      transformations.some((t) => t.reason.includes("tail-recursive")),
    ).toBe(true);
  });

  it("does not optimize non-tail calls", () => {
    const source = `
      name TestNonTailRecursion;

      define {
        function fibonacci(n: uint256) -> uint256 {
          if (n == 0) {
            return 0;
          }
          if (n == 1) {
            return 1;
          }
          return fibonacci(n - 1) + fibonacci(n - 2);
        };
      }

      code {
        return;
      }
    `;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        "Parse failed: " +
          (Result.firstError(parseResult)?.message || "Unknown error"),
      );
    }

    const typeResult = TypeChecker.checkProgram(parseResult.value);
    if (!typeResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeResult)?.message || "Unknown error"),
      );
    }

    // Build IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeResult.value.types,
    );
    if (!irResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(irResult)?.message || "Unknown error"),
      );
    }

    const module = irResult.value;
    const fibFunc = module.functions.get("fibonacci")!;

    // Count blocks before optimization
    const blocksBefore = fibFunc.blocks.size;

    // Apply tail call optimization
    const pass = new TailCallOptimizationStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("fibonacci")!;

    // Count blocks after optimization
    const blocksAfter = optimizedFunc.blocks.size;

    // Should not have changed the structure (non-tail recursion)
    expect(blocksAfter).toBe(blocksBefore);

    // Should have no transformations
    const transformations = context.getTransformations();
    expect(transformations.length).toBe(0);
  });

  it("optimizes multiple tail-recursive calls in different branches", () => {
    const source = `
      name TestMultipleTailCalls;

      define {
        function search(n: uint256, target: uint256) -> bool {
          if (n == target) {
            return true;
          }
          if (n > target) {
            return search(n - 1, target);
          }
          return false;
        };
      }

      code {
        return;
      }
    `;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        "Parse failed: " +
          (Result.firstError(parseResult)?.message || "Unknown error"),
      );
    }

    const typeResult = TypeChecker.checkProgram(parseResult.value);
    if (!typeResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeResult)?.message || "Unknown error"),
      );
    }

    // Build IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeResult.value.types,
    );
    if (!irResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(irResult)?.message || "Unknown error"),
      );
    }

    const module = irResult.value;

    // Apply tail call optimization
    const pass = new TailCallOptimizationStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("search")!;

    // Count call terminators after optimization
    let callsAfter = 0;
    for (const [, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "call") {
        callsAfter++;
      }
    }

    // Should have eliminated tail calls
    expect(callsAfter).toBe(0);

    // Should have recorded transformations
    const transformations = context.getTransformations();
    expect(transformations.length).toBeGreaterThan(0);
  });

  it("preserves debug information during optimization", () => {
    const source = `
      name TestDebugPreservation;

      define {
        function countdown(n: uint256) -> uint256 {
          if (n == 0) {
            return 0;
          }
          return countdown(n - 1);
        };
      }

      code {
        return;
      }
    `;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        "Parse failed: " +
          (Result.firstError(parseResult)?.message || "Unknown error"),
      );
    }

    const typeResult = TypeChecker.checkProgram(parseResult.value);
    if (!typeResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeResult)?.message || "Unknown error"),
      );
    }

    // Build IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeResult.value.types,
    );
    if (!irResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(irResult)?.message || "Unknown error"),
      );
    }

    const module = irResult.value;

    // Apply tail call optimization
    const pass = new TailCallOptimizationStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("countdown")!;

    // Verify tail calls were eliminated
    let callsAfter = 0;
    for (const [, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "call") {
        callsAfter++;
      }
    }
    expect(callsAfter).toBe(0);

    // Check that transformations were tracked (debug preservation)
    const transformations = context.getTransformations();
    expect(transformations.length).toBeGreaterThan(0);

    // Each transformation should have original and result contexts
    for (const transform of transformations) {
      expect(transform.pass).toBe("tail-call-optimization");
      expect(transform.reason).toBeTruthy();
      // Original should have contexts (may be empty array for deletions)
      expect(Array.isArray(transform.original)).toBe(true);
      expect(Array.isArray(transform.result)).toBe(true);
    }
  });

  it("handles functions with no parameters", () => {
    const source = `
      name TestNoParams;

      define {
        function alwaysZero() -> uint256 {
          if (true) {
            return 0;
          }
          return alwaysZero();
        };
      }

      code {
        return;
      }
    `;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        "Parse failed: " +
          (Result.firstError(parseResult)?.message || "Unknown error"),
      );
    }

    const typeResult = TypeChecker.checkProgram(parseResult.value);
    if (!typeResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeResult)?.message || "Unknown error"),
      );
    }

    // Build IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeResult.value.types,
    );
    if (!irResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(irResult)?.message || "Unknown error"),
      );
    }

    const module = irResult.value;

    // Apply tail call optimization
    const pass = new TailCallOptimizationStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("alwaysZero")!;

    // Should still work with no parameters
    let callsAfter = 0;
    for (const [, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "call") {
        callsAfter++;
      }
    }

    expect(callsAfter).toBe(0);
  });
});
