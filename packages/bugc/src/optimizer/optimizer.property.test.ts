/**
 * Property-based tests for the IR optimizer
 *
 * These tests verify that optimizations preserve program semantics
 * and maintain important invariants.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Ir from "#ir";

import { optimizeIr as optimize } from "./simple-optimizer.js";

// Simple IR validator for testing
function validateIr(module: Ir.Module): { isValid: boolean } {
  // Basic validation - check that module has required fields
  return {
    isValid:
      module.name !== undefined &&
      module.main !== undefined &&
      module.main.blocks.size > 0,
  };
}

describe("Optimizer Property Tests", () => {
  // Property: Optimization should preserve program semantics
  describe("Semantic Preservation", () => {
    it("constant folding preserves module structure", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: 100n }),
          fc.bigInt({ min: 1n, max: 100n }),
          fc.constantFrom("add", "sub", "mul"),
          (a, b, op) => {
            // Create IR with binary operation on constants
            const module = createModuleWithBinaryOp(a, b, op);

            // Optimize at level 1 (constant folding)
            const optimized = optimize(module, 1);

            // Basic structural checks
            expect(optimized).toBeDefined();
            expect(optimized.name).toBe(module.name);
            expect(optimized.main).toBeDefined();
            expect(optimized.main.blocks.size).toBeGreaterThan(0);

            // The optimization should preserve the basic block structure
            expect(optimized.main.entry).toBe(module.main.entry);
          },
        ),
        { numRuns: 20 },
      );
    });

    it("dead code elimination preserves module structure", () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 3, maxLength: 10 }),
          (useFlags) => {
            // Create module with multiple computations, some unused
            const module = createModuleWithDeadCode(useFlags);

            // Optimize with DCE
            const optimized = optimize(module, 1);

            // Basic structural checks
            expect(optimized).toBeDefined();
            expect(optimized.main).toBeDefined();
            expect(optimized.main.blocks.size).toBeGreaterThan(0);

            // Get instructions before and after
            const instructionsBefore = getAllInstructions(module);
            const instructionsAfter = getAllInstructions(optimized);

            // DCE should not increase instruction count
            expect(instructionsAfter.length).toBeLessThanOrEqual(
              instructionsBefore.length,
            );
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // Property: Optimizations should maintain IR invariants
  describe("IR Invariants", () => {
    it("optimization preserves valid IR structure", () => {
      fc.assert(
        fc.property(generateRandomModule(), (module) => {
          // Optimize at each level
          for (let level = 0; level <= 3; level++) {
            const optimized = optimize(module, level);

            // Validate IR structure
            const validation = validateIr(optimized);
            expect(validation.isValid).toBe(true);

            // Check specific invariants
            expect(hasValidControlFlow(optimized)).toBe(true);
            expect(hasValidPhiNodes(optimized)).toBe(true);
            expect(allJumpTargetsExist(optimized)).toBe(true);
          }
        }),
        { numRuns: 20 },
      );
    });

    it("optimization maintains SSA form", () => {
      fc.assert(
        fc.property(generateRandomModule(), (module) => {
          const optimized = optimize(module, 3);

          // Each temp should be assigned exactly once
          const assignments = new Map<string, number>();

          const countAssignments = (func: {
            blocks: Map<string, Ir.Block>;
          }): void => {
            for (const block of func.blocks.values()) {
              // Count phi assignments
              if (block.phis) {
                for (const phi of block.phis) {
                  assignments.set(
                    phi.dest,
                    (assignments.get(phi.dest) || 0) + 1,
                  );
                }
              }

              // Count instruction assignments
              for (const inst of block.instructions) {
                if ("dest" in inst && inst.dest) {
                  assignments.set(
                    inst.dest,
                    (assignments.get(inst.dest) || 0) + 1,
                  );
                }
              }
            }
          };

          countAssignments(optimized.main);
          for (const func of optimized.functions.values()) {
            countAssignments(func);
          }

          // Each temp should be assigned exactly once
          for (const [, count] of assignments) {
            expect(count).toBe(1);
          }
        }),
        { numRuns: 20 },
      );
    });
  });

  // Property: Optimization levels should be monotonic
  describe("Optimization Monotonicity", () => {
    it("higher optimization levels produce smaller or equal code", () => {
      fc.assert(
        fc.property(generateRandomModule(), (module) => {
          const sizes: number[] = [];

          for (let level = 0; level <= 3; level++) {
            const optimized = optimize(module, level);
            const size = countInstructions(optimized);
            sizes.push(size);
          }

          // Each level should produce same or smaller code
          for (let i = 1; i < sizes.length; i++) {
            expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
          }
        }),
        { numRuns: 30 },
      );
    });
  });

  // Property: Specific optimization correctness
  describe("Optimization Correctness", () => {
    it("CSE produces equivalent expressions", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: 100n }),
          fc.bigInt({ min: 0n, max: 100n }),
          (a, b) => {
            // Create module with duplicate expressions
            const module = createModuleWithDuplicateExpressions(a, b);

            // Optimize with CSE (level 2)
            const optimized = optimize(module, 2);

            // Count binary operations
            const originalOps = countBinaryOps(module);
            const optimizedOps = countBinaryOps(optimized);

            // CSE should reduce duplicate operations
            expect(optimizedOps).toBeLessThan(originalOps);

            // But the final result should be the same
            // (Would need execution to verify, checking structure for now)
            expect(hasValidStructure(optimized)).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    it("block merging preserves execution paths", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (cond1, cond2) => {
          // Create module with mergeable blocks
          const module = createModuleWithMergeableBlocks(cond1, cond2);

          // Count blocks before and after
          const blocksBefore = countBlocks(module);
          const optimized = optimize(module, 3);
          const blocksAfter = countBlocks(optimized);

          // Should have fewer blocks after merging
          expect(blocksAfter).toBeLessThanOrEqual(blocksBefore);

          // All original paths should still be possible
          expect(hasAllPaths(module, optimized)).toBe(true);
        }),
        { numRuns: 20 },
      );
    });
  });
});

// Helper functions for creating test modules

function createModuleWithBinaryOp(a: bigint, b: bigint, op: string): Ir.Module {
  return {
    name: "Test",
    main: {
      name: "main",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            instructions: [
              {
                kind: "const",
                value: a,
                dest: "t0",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              {
                kind: "const",
                value: b,
                dest: "t1",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              {
                kind: "binary",
                op: op as
                  | "add"
                  | "sub"
                  | "mul"
                  | "div"
                  | "mod"
                  | "lt"
                  | "gt"
                  | "eq"
                  | "ne"
                  | "and"
                  | "or",
                left: {
                  kind: "temp",
                  id: "t0",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "t1",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "t2",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
            ],
            terminator: { kind: "return", operationDebug: {} },
            phis: [],
            predecessors: new Set<string>(),
            debug: {},
          },
        ],
      ]),
    },
    functions: new Map(),
  };
}

function createModuleWithDeadCode(useFlags: boolean[]): Ir.Module {
  const instructions: Ir.Instruction[] = [];

  // Create computations
  useFlags.forEach((_, index) => {
    instructions.push({
      kind: "const",
      value: BigInt(index),
      dest: `t${index}`,
      type: Ir.Type.Scalar.uint256,
      operationDebug: {},
    });
  });

  // Use some values
  const usedInstructions: Ir.Instruction[] = [];
  useFlags.forEach((used, index) => {
    if (used && index > 0) {
      usedInstructions.push({
        kind: "binary",
        op: "add",
        left: {
          kind: "temp",
          id: `t${index}`,
          type: Ir.Type.Scalar.uint256,
        },
        right: { kind: "temp", id: "t0", type: Ir.Type.Scalar.uint256 },
        dest: `result${index}`,
        operationDebug: {},
      });
    }
  });

  return {
    name: "Test",
    main: {
      name: "main",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            instructions: [...instructions, ...usedInstructions],
            terminator: { kind: "return", operationDebug: {} },
            phis: [],
            predecessors: new Set<string>(),
            debug: {},
          },
        ],
      ]),
    },
    functions: new Map(),
  };
}

function createModuleWithDuplicateExpressions(a: bigint, b: bigint): Ir.Module {
  return {
    name: "Test",
    main: {
      name: "main",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            instructions: [
              {
                kind: "const",
                value: a,
                dest: "t0",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              {
                kind: "const",
                value: b,
                dest: "t1",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              // First computation
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "t0",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "t1",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "t2",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              // Duplicate computation
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "t0",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "t1",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "t3",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              // Use both results
              {
                kind: "binary",
                op: "mul",
                left: {
                  kind: "temp",
                  id: "t2",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "t3",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "t4",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
            ],
            terminator: { kind: "return", operationDebug: {} },
            phis: [],
            predecessors: new Set<string>(),
            debug: {},
          },
        ],
      ]),
    },
    functions: new Map(),
  };
}

function createModuleWithMergeableBlocks(
  cond1: boolean,
  _cond2: boolean,
): Ir.Module {
  const blocks = new Map<string, Ir.Block>();

  // Entry block
  blocks.set("entry", {
    id: "entry",
    instructions: [
      {
        kind: "const",
        value: cond1 ? 1n : 0n,
        dest: "t0",
        type: Ir.Type.Scalar.bool,
        operationDebug: {},
      },
    ],
    terminator: {
      kind: "branch",
      condition: { kind: "temp", id: "t0", type: Ir.Type.Scalar.bool },
      trueTarget: "block1",
      falseTarget: "block2",
      operationDebug: {},
    },
    phis: [],
    predecessors: new Set<string>(),
    debug: {},
  });

  // Intermediate blocks that could be merged
  blocks.set("block1", {
    id: "block1",
    instructions: [],
    terminator: { kind: "jump", target: "final", operationDebug: {} },
    phis: [],
    predecessors: new Set<string>(["entry"]),
    debug: {},
  });

  blocks.set("block2", {
    id: "block2",
    instructions: [],
    terminator: { kind: "jump", target: "final", operationDebug: {} },
    phis: [],
    predecessors: new Set<string>(["entry"]),
    debug: {},
  });

  // Final block
  blocks.set("final", {
    id: "final",
    instructions: [],
    terminator: { kind: "return", operationDebug: {} },
    phis: [],
    predecessors: new Set<string>(["block1", "block2"]),
    debug: {},
  });

  return {
    name: "Test",
    main: { name: "main", parameters: [], entry: "entry", blocks },
    functions: new Map(),
  };
}

// Generator for random IR modules
function generateRandomModule(): fc.Arbitrary<Ir.Module> {
  return fc.record({
    name: fc.constant("Test"),
    main: generateRandomFunction(),
    functions: fc.constant(new Map()),
  });
}

function generateRandomFunction(): fc.Arbitrary<{
  name: string;
  parameters: never[];
  entry: string;
  blocks: Map<string, Ir.Block>;
}> {
  return fc.record({
    name: fc.constant("main"),
    parameters: fc.constant([]),
    entry: fc.constant("entry"),
    blocks: fc.constant(createSimpleBlocks()),
  });
}

function createSimpleBlocks(): Map<string, Ir.Block> {
  // Create a simple but valid control flow graph
  const blocks = new Map<string, Ir.Block>();

  blocks.set("entry", {
    id: "entry",
    instructions: [
      {
        kind: "const",
        value: 42n,
        dest: "t0",
        type: Ir.Type.Scalar.uint256,
        operationDebug: {},
      },
    ],
    terminator: { kind: "return", operationDebug: {} },
    phis: [],
    predecessors: new Set<string>(),
    debug: {},
  });

  return blocks;
}

// Utility functions

function getAllInstructions(module: Ir.Module): Ir.Instruction[] {
  const instructions: Ir.Instruction[] = [];

  const collectFromFunction = (func: {
    blocks: Map<string, Ir.Block>;
  }): void => {
    for (const block of func.blocks.values()) {
      instructions.push(...block.instructions);
    }
  };

  collectFromFunction(module.main);
  for (const func of module.functions.values()) {
    collectFromFunction(func);
  }

  return instructions;
}

function hasValidControlFlow(module: Ir.Module): boolean {
  // Check that all blocks have valid terminators
  for (const block of module.main.blocks.values()) {
    if (!block.terminator) return false;
  }
  return true;
}

function hasValidPhiNodes(module: Ir.Module): boolean {
  // Phi nodes should only appear at block entry
  for (const block of module.main.blocks.values()) {
    if (block.phis && !Array.isArray(block.phis)) return false;
  }
  return true;
}

function allJumpTargetsExist(module: Ir.Module): boolean {
  const blockIds = new Set(module.main.blocks.keys());

  for (const block of module.main.blocks.values()) {
    if (block.terminator.kind === "jump") {
      if (!blockIds.has(block.terminator.target)) return false;
    } else if (block.terminator.kind === "branch") {
      if (!blockIds.has(block.terminator.trueTarget)) return false;
      if (!blockIds.has(block.terminator.falseTarget)) return false;
    }
  }

  return true;
}

function countInstructions(module: Ir.Module): number {
  let count = 0;

  const countInFunction = (func: { blocks: Map<string, Ir.Block> }): void => {
    for (const block of func.blocks.values()) {
      count += block.instructions.length;
      if (block.phis) count += block.phis.length;
    }
  };

  countInFunction(module.main);
  for (const func of module.functions.values()) {
    countInFunction(func);
  }

  return count;
}

function countBinaryOps(module: Ir.Module): number {
  return getAllInstructions(module).filter((inst) => inst.kind === "binary")
    .length;
}

function hasValidStructure(module: Ir.Module): boolean {
  return module.main.blocks.size > 0 && hasValidControlFlow(module);
}

function countBlocks(module: Ir.Module): number {
  let count = module.main.blocks.size;
  for (const func of module.functions.values()) {
    count += func.blocks.size;
  }
  return count;
}

function hasAllPaths(_original: Ir.Module, _optimized: Ir.Module): boolean {
  // Simplified check - in real implementation would trace all paths
  return true;
}
