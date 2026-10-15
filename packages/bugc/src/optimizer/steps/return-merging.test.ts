import { describe, it, expect } from "vitest";

import * as Irgen from "#irgen";
import { parse } from "#parser";
import { Result } from "#result";
import { compile } from "#compiler";
import * as TypeChecker from "#typechecker";
import { executeProgram } from "#test/evm/behavioral";

import { ReturnMergingStep } from "./return-merging.js";
import { OptimizationContextImpl } from "../optimizer.js";

describe("ReturnMergingStep", () => {
  it("merges multiple return void blocks into one", () => {
    const source = `
      name TestReturnMerge;

      storage {
        [0] x: uint256;
      }

      code {
        if (x == 0) {
          return;
        }

        if (x == 1) {
          return;
        }

        if (x == 2) {
          return;
        }

        x = x + 1;
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
    const mainFunc = module.main;

    // Count return blocks before optimization
    let returnBlocksBefore = 0;
    for (const [, block] of mainFunc.blocks) {
      if (
        block.terminator.kind === "return" &&
        block.instructions.length === 0
      ) {
        returnBlocksBefore++;
      }
    }

    // Should have multiple return blocks initially
    expect(returnBlocksBefore).toBeGreaterThan(1);

    // Apply return merging
    const pass = new ReturnMergingStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.main;

    // Count return blocks after optimization
    let returnBlocksAfter = 0;
    let mergedReturnBlockId: string | null = null;
    for (const [blockId, block] of optimizedFunc.blocks) {
      if (
        block.terminator.kind === "return" &&
        block.instructions.length === 0
      ) {
        returnBlocksAfter++;
        mergedReturnBlockId = blockId;
      }
    }

    // Should have only one return block after optimization
    expect(returnBlocksAfter).toBe(1);
    expect(mergedReturnBlockId).not.toBeNull();

    // Check that multiple blocks now jump to the merged return block
    let jumpsToReturn = 0;
    for (const [, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "branch") {
        if (block.terminator.trueTarget === mergedReturnBlockId)
          jumpsToReturn++;
        if (block.terminator.falseTarget === mergedReturnBlockId)
          jumpsToReturn++;
      } else if (
        block.terminator.kind === "jump" &&
        block.terminator.target === mergedReturnBlockId
      ) {
        jumpsToReturn++;
      }
    }

    // Should have multiple jumps to the single return block
    expect(jumpsToReturn).toBeGreaterThan(1);
  });

  it("does not merge return blocks with different values", () => {
    const source = `
      name TestDifferentReturns;

      define {
        function getValue(x: uint256) -> uint256 {
          if (x == 0) {
            return 10;
          }
          return 20;
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
    const getValueFunc = module.functions.get("getValue")!;

    // Count return blocks before
    let returnBlocksBefore = 0;
    for (const [, block] of getValueFunc.blocks) {
      if (block.terminator.kind === "return") {
        returnBlocksBefore++;
      }
    }

    // Apply return merging
    const pass = new ReturnMergingStep();
    const context = new OptimizationContextImpl();
    const optimized = pass.run(module, context);
    const optimizedFunc = optimized.functions.get("getValue")!;

    // Count return blocks after
    let returnBlocksAfter = 0;
    for (const [, block] of optimizedFunc.blocks) {
      if (block.terminator.kind === "return") {
        returnBlocksAfter++;
      }
    }

    // Should not merge returns with different values
    expect(returnBlocksAfter).toBe(returnBlocksBefore);
  });

  // A call's continuation is entered only from its call, so it is
  // neither removed nor entered by a jump. Each `return;` here is a
  // block of its own; the order puts the continuation after, then
  // before, the other return. The callee returns a value or nothing
  // (a call with no `dest`)
  const callees = {
    value: `function f(n: uint256) -> uint256 {
    if (n == 0) { return 0; }
    r = r + 1;
    return f(n - 1);
  };`,
    void: `function f(n: uint256) {
    if (n == 0) { return; }
    r = r + 1;
    f(n - 1);
  };`,
  };
  const program = (callee: string, body: string) => `name ReturnAfterCall;
define {
  ${callee}
}
storage { [0] r: uint256; }
create {}
code {
${body}
}`;
  const variants = {
    "after the other return": `
  if (msg.data.length == 0) {
    return;
  }
  f(2);
  return;`,
    "before the other return": `
  if (msg.data.length != 0) {
    f(2);
    return;
  }
  return;`,
  };

  for (const [name, body] of Object.entries(variants)) {
    for (const [returns, callee] of Object.entries(callees)) {
      it(`keeps a call's continuation apart (${name}, ${returns})`, async () => {
        const source = program(callee, body);

        const compiled = await compile({
          to: "ir",
          source,
          optimizer: { level: 3 },
        });
        if (!compiled.success) throw new Error("compile failed");
        const { blocks } = compiled.value.ir.main;
        const continuations = [...blocks.values()].flatMap((block) =>
          block.terminator.kind === "call"
            ? [block.terminator.continuation]
            : [],
        );
        expect(continuations).not.toHaveLength(0);
        for (const continuation of continuations) {
          expect(blocks.has(continuation)).toBe(true);
          for (const block of blocks.values()) {
            const { terminator } = block;
            const targets =
              terminator.kind === "jump"
                ? [terminator.target]
                : terminator.kind === "branch"
                  ? [terminator.trueTarget, terminator.falseTarget]
                  : [];
            expect(targets).not.toContain(continuation);
          }
        }

        for (const [calldata, expected] of [
          ["", 0n],
          ["0x01", 2n],
        ] as const) {
          const result = await executeProgram(source, {
            calldata,
            optimizationLevel: 3,
          });
          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(0n)).toBe(expected);
        }
      });
    }
  }
});
