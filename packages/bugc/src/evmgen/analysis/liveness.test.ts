import { describe, it, expect } from "vitest";

import * as Ir from "#ir";
import * as Liveness from "./liveness.js";

describe("Liveness Analysis", () => {
  it("should identify live-in and live-out sets for a simple function", () => {
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
              {
                kind: "const",
                value: 10n,
                type: Ir.Type.Scalar.uint256,
                dest: "%2",
                operationDebug: {},
              },
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%1",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%2",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%3",
                operationDebug: {},
              },
            ],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);

    // Entry block should have no live-in (it's the entry)
    expect(liveness.liveIn.get("entry")?.size).toBe(0);

    // No live-out since it returns
    expect(liveness.liveOut.get("entry")?.size).toBe(0);

    // No cross-block values in a single-block function
    expect(liveness.crossBlockValues.size).toBe(0);
  });

  it("should track values across blocks", () => {
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
            ],
            terminator: {
              kind: "branch",
              condition: { kind: "temp", id: "%1", type: Ir.Type.Scalar.bool },
              trueTarget: "then",
              falseTarget: "else",
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
        [
          "then",
          {
            id: "then",
            phis: [],
            instructions: [
              {
                kind: "const",
                value: 10n,
                type: Ir.Type.Scalar.uint256,
                dest: "%2",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "jump",
              target: "merge",
              operationDebug: {},
            },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
        [
          "else",
          {
            id: "else",
            phis: [],
            instructions: [
              {
                kind: "const",
                value: 20n,
                type: Ir.Type.Scalar.uint256,
                dest: "%3",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "jump",
              target: "merge",
              operationDebug: {},
            },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
        [
          "merge",
          {
            id: "merge",
            phis: [],
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["then", "else"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);

    // %1 is used in the branch, but it's also defined in entry, so it's not live-out
    // (it's consumed within the block)
    expect(liveness.liveOut.get("entry")?.has("%1")).toBe(false);

    // No values cross from then/else to merge
    expect(liveness.liveIn.get("merge")?.size).toBe(0);
  });

  it("should handle phi nodes correctly", () => {
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
                value: 0n,
                type: Ir.Type.Scalar.uint256,
                dest: "%1",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "jump",
              target: "loop",
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
        [
          "loop",
          {
            id: "loop",
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
                  [
                    "loop",
                    {
                      kind: "temp",
                      id: "%3",
                      type: Ir.Type.Scalar.uint256,
                    },
                  ],
                ]),
                dest: "%2",
                type: Ir.Type.Scalar.uint256,
                operationDebug: {},
              },
            ],
            instructions: [
              {
                kind: "const",
                value: 1n,
                type: Ir.Type.Scalar.uint256,
                dest: "%inc",
                operationDebug: {},
              },
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%2",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%inc",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%3",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 10n,
                type: Ir.Type.Scalar.uint256,
                dest: "%limit",
                operationDebug: {},
              },
              {
                kind: "binary",
                op: "lt",
                left: {
                  kind: "temp",
                  id: "%3",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%limit",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%cond",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "branch",
              condition: {
                kind: "temp",
                id: "%cond",
                type: Ir.Type.Scalar.bool,
              },
              trueTarget: "loop",
              falseTarget: "exit",
              operationDebug: {},
            },
            predecessors: new Set(["entry", "loop"]),
            debug: {},
          } as Ir.Block,
        ],
        [
          "exit",
          {
            id: "exit",
            phis: [],
            instructions: [],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%3",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            predecessors: new Set(["loop"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);

    // %1 should be live-out of entry (used by phi in loop)
    expect(liveness.liveOut.get("entry")).toContain("%1");

    // %3 should be live-out of loop (used by phi and return)
    expect(liveness.liveOut.get("loop")).toContain("%3");

    // %3 should be live-in to exit (used in return)
    expect(liveness.liveIn.get("exit")).toContain("%3");

    // Cross-block values
    expect(liveness.crossBlockValues).toContain("%1");
    expect(liveness.crossBlockValues).toContain("%3");
  });
});
