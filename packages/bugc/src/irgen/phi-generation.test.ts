import { describe, it, expect } from "vitest";
import { parse } from "#parser";
import { checkProgram } from "#typechecker";
import { generateModule } from "#irgen";
import { Formatter } from "#ir/analysis";

describe("Phi Node Generation", () => {
  it("should generate phi nodes for values used across branches", () => {
    const source = `name PhiTest;
storage {
  [0] x: uint256;
}
code {
  let result: uint256 = 0;

  if (x > 5) {
    result = 20;
  } else {
    result = 30;
  }

  // Use result after the merge - should require a phi node
  x = result;
}`;

    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error("Parse failed");
    }
    expect(parseResult.success).toBe(true);

    if (!parseResult.value) {
      throw new Error("Parse result has no value");
    }
    const checkResult = checkProgram(parseResult.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) throw new Error("Type check failed");

    if (!checkResult.value) {
      throw new Error("Check result has no value");
    }
    const irResult = generateModule(parseResult.value, checkResult.value.types);
    expect(irResult.success).toBe(true);
    if (!irResult.success) throw new Error("IR generation failed");

    if (!irResult.value) {
      throw new Error("IR result has no value");
    }
    const ir = irResult.value;

    // Format the IR to check for phi nodes
    const formatter = new Formatter();
    const formatted = formatter.format(ir);

    // Should contain phi nodes
    // console.debug("Formatted IR:", formatted);

    // Check that merge blocks have phi nodes
    let foundPhiInMergeBlock = false;
    for (const [_blockId, _block] of ir.main.blocks.entries()) {
      // console.debug(`Block ${_blockId}: phis = ${_block.phis.length}`);
      if (_blockId.includes("merge") && _block.phis.length > 0) {
        foundPhiInMergeBlock = true;
      }
    }

    expect(formatted).toContain("phi");
    expect(foundPhiInMergeBlock).toBe(true);
  });

  it("should generate phi nodes for nested conditionals", () => {
    const source = `name NestedPhiTest;
storage {
  [0] x: uint256;
}
code {
  let result: uint256 = 100;

  if (x < 10) {
    result = 1;
  } else {
    if (x < 20) {
      result = 2;
    } else {
      result = 3;
    }
  }

  // Use result after all merges
  x = result;
}`;

    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error("Parse failed");
    }
    expect(parseResult.success).toBe(true);

    if (!parseResult.value) {
      throw new Error("Parse result has no value");
    }
    const checkResult = checkProgram(parseResult.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) throw new Error("Type check failed");

    if (!checkResult.value) {
      throw new Error("Check result has no value");
    }
    const irResult = generateModule(parseResult.value, checkResult.value.types);
    expect(irResult.success).toBe(true);
    if (!irResult.success) throw new Error("IR generation failed");

    if (!irResult.value) {
      throw new Error("IR result has no value");
    }
    const ir = irResult.value;

    // Count phi nodes across all blocks
    let totalPhiNodes = 0;
    for (const block of ir.main.blocks.values()) {
      totalPhiNodes += block.phis.length;
    }

    // Should have phi nodes for the nested structure
    // console.debug("Total phi nodes found:", totalPhiNodes);
    for (const [_blockId, _block] of ir.main.blocks.entries()) {
      // console.debug(`Block ${blockId}: phis = ${block.phis.length}`);
    }
    expect(totalPhiNodes).toBeGreaterThan(0);
  });

  it("should generate phi nodes for loop variables", () => {
    const source = `name LoopPhiTest;
storage {
  [0] x: uint256;
}
code {
  let sum: uint256 = 0;

  for (let i: uint256 = 0; i < 10; i = i + 1) {
    sum = sum + i;
  }

  x = sum;
}`;

    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error("Parse failed");
    }
    expect(parseResult.success).toBe(true);

    if (!parseResult.value) {
      throw new Error("Parse result has no value");
    }
    const checkResult = checkProgram(parseResult.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) throw new Error("Type check failed");

    if (!checkResult.value) {
      throw new Error("Check result has no value");
    }
    const irResult = generateModule(parseResult.value, checkResult.value.types);
    expect(irResult.success).toBe(true);
    if (!irResult.success) throw new Error("IR generation failed");

    if (!irResult.value) {
      throw new Error("IR result has no value");
    }
    const ir = irResult.value;

    // Loop headers should have phi nodes for loop-carried values
    let foundLoopPhi = false;
    for (const [_blockId, _block] of ir.main.blocks.entries()) {
      if (
        (_blockId.includes("loop") || _blockId.includes("header")) &&
        _block.phis.length > 0
      ) {
        foundLoopPhi = true;
      }
    }

    // Loops should definitely have phi nodes
    expect(foundLoopPhi).toBe(true);
  });
});
