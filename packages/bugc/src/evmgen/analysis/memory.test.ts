import { describe, it, expect } from "vitest";

import * as Ir from "#ir";

import * as Memory from "./memory.js";
import * as Liveness from "./liveness.js";

describe("Memory Planning", () => {
  it("should allocate memory for phi destinations", () => {
    const func: Ir.Function = {
      name: "test",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            phis: [],
            instructions: [
              {
                kind: "const",
                value: 1n,
                type: Ir.Type.Scalar.uint256,
                dest: "%1",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 2n,
                type: Ir.Type.Scalar.uint256,
                dest: "%2",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "branch",
              condition: {
                kind: "const",
                value: true,
                type: Ir.Type.Scalar.bool,
              },
              trueTarget: "merge",
              falseTarget: "merge",
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
        [
          "merge",
          {
            id: "merge",
            phis: [
              {
                kind: "phi",
                sources: new Map([
                  [
                    "entry",
                    {
                      kind: "temp",
                      id: "%1",
                      type: Ir.Type.Scalar.uint256,
                    },
                  ],
                ]),
                dest: "%3",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
            ],
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);

    expect(memoryResult.success).toBe(true);
    if (!memoryResult.success) throw new Error("Memory planning failed");

    const memory = memoryResult.value;

    // Phi destination %3 should be allocated memory
    expect("%3" in memory.allocations).toBe(true);
    // %1 is allocated first at 0x80, then %3 at 0xa0 (160)
    expect(memory.allocations["%3"].offset).toBe(0xa0);

    // Cross-block value %1 should also be allocated
    expect("%1" in memory.allocations).toBe(true);
    expect(memory.allocations["%1"].offset).toBe(0x80);
  });

  it("should allocate memory for cross-block values", () => {
    const func: Ir.Function = {
      name: "test",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            phis: [],
            instructions: [
              {
                kind: "const",
                value: 42n,
                type: Ir.Type.Scalar.uint256,
                dest: "%1",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "jump",
              target: "next",
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
        [
          "next",
          {
            id: "next",
            phis: [],
            instructions: [
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%1",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "const",
                  value: 1n,
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%2",
                operationDebug: {},
              },
            ],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);

    expect(memoryResult.success).toBe(true);
    if (!memoryResult.success) throw new Error("Memory planning failed");

    const memory = memoryResult.value;

    // %1 crosses block boundary, should be allocated
    expect("%1" in memory.allocations).toBe(true);
  });

  it("should allocate memory for deeply nested stack values", () => {
    const func: Ir.Function = {
      name: "test",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            phis: [],
            instructions: [
              // Create many values to simulate deep stack
              ...Array.from({ length: 20 }, (_, i) => ({
                kind: "const" as const,
                value: BigInt(i),
                type: Ir.Type.Scalar.uint256,
                dest: `%${i}`,
                operationDebug: {},
              })),
            ],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);

    expect(memoryResult.success).toBe(true);
    if (!memoryResult.success) throw new Error("Memory planning failed");

    const memory = memoryResult.value;

    // Some bottom values should be spilled to memory
    // (exact values depend on threshold, but some should be allocated)
    expect(Object.keys(memory.allocations).length).toBeGreaterThan(0);
  });

  it("should use sequential memory slots", () => {
    const func: Ir.Function = {
      name: "test",
      parameters: [],
      entry: "entry",
      blocks: new Map([
        [
          "entry",
          {
            id: "entry",
            phis: [],
            instructions: [],
            terminator: {
              kind: "jump",
              target: "block1",
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
        [
          "block1",
          {
            id: "block1",
            phis: [
              {
                kind: "phi",
                sources: new Map([
                  [
                    "entry",
                    {
                      kind: "const",
                      value: 1n,
                      type: Ir.Type.Scalar.uint256,
                    },
                  ],
                ]),
                dest: "%phi1",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
              {
                kind: "phi",
                sources: new Map([
                  [
                    "entry",
                    {
                      kind: "const",
                      value: 2n,
                      type: Ir.Type.Scalar.uint256,
                    },
                  ],
                ]),
                dest: "%phi2",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
            ],
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);

    expect(memoryResult.success).toBe(true);
    if (!memoryResult.success) throw new Error("Memory planning failed");

    const memory = memoryResult.value;

    // Both phi destinations should be allocated
    expect("%phi1" in memory.allocations).toBe(true);
    expect("%phi2" in memory.allocations).toBe(true);

    // Should use sequential 32-byte slots
    const phi1Offset = memory.allocations["%phi1"].offset;
    const phi2Offset = memory.allocations["%phi2"].offset;
    expect(Math.abs(phi2Offset - phi1Offset)).toBe(32);

    // Free pointer should be after all allocations
    expect(memory.nextStaticOffset).toBeGreaterThanOrEqual(0x80 + 64);
  });
});
