import { describe, it, expect } from "vitest";
import * as Ir from "#ir";
import { Formatter } from "./formatter.js";

describe("IrFormatter", () => {
  it("should format phi nodes with predecessor labels", () => {
    const module: Ir.Module = {
      name: "TestModule",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "entry",
            {
              id: "entry",
              instructions: [],
              terminator: {
                kind: "branch",
                condition: {
                  kind: "temp",
                  id: "t0",
                  type: Ir.Type.Scalar.bool,
                },
                trueTarget: "then",
                falseTarget: "else",
                operationDebug: {},
              },
              predecessors: new Set(),
              phis: [],
              debug: {},
            },
          ],
          [
            "then",
            {
              id: "then",
              instructions: [
                {
                  kind: "const",
                  value: 20n,
                  type: Ir.Type.Scalar.uint256,
                  dest: "t1",
                  operationDebug: {},
                },
              ],
              terminator: {
                kind: "jump",
                target: "merge",
                operationDebug: {},
              },
              predecessors: new Set(["entry"]),
              phis: [],
              debug: {},
            },
          ],
          [
            "else",
            {
              id: "else",
              instructions: [
                {
                  kind: "const",
                  value: 30n,
                  type: Ir.Type.Scalar.uint256,
                  dest: "t2",
                  operationDebug: {},
                },
              ],
              terminator: {
                kind: "jump",
                target: "merge",
                operationDebug: {},
              },
              predecessors: new Set(["entry"]),
              phis: [],
              debug: {},
            },
          ],
          [
            "merge",
            {
              id: "merge",
              instructions: [],
              terminator: {
                kind: "return",
                operationDebug: {},
              },
              predecessors: new Set(["then", "else"]),
              phis: [
                {
                  kind: "phi",
                  sources: new Map([
                    [
                      "then",
                      {
                        kind: "temp",
                        id: "t1",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                    [
                      "else",
                      {
                        kind: "temp",
                        id: "t2",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                  ]),
                  dest: "t3",
                  type: Ir.Type.Scalar.uint256,
                  operationDebug: {},
                },
              ],
              debug: {},
            },
          ],
        ]),
      },
    };

    const formatter = new Formatter();
    const formatted = formatter.format(module);

    // Check that phi node is formatted
    expect(formatted).toContain("phi");

    // Check that phi node shows predecessor blocks
    expect(formatted).toContain("[then:");
    expect(formatted).toContain("[else:");

    // Check that phi node shows the correct sources
    expect(formatted).toContain("%t1");
    expect(formatted).toContain("%t2");

    // Check that phi node shows the destination
    expect(formatted).toContain("%t3");
  });

  it("should format multiple phi nodes in a block", () => {
    const module: Ir.Module = {
      name: "TestModule",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "merge",
            {
              id: "merge",
              instructions: [],
              terminator: {
                kind: "return",
                operationDebug: {},
              },
              predecessors: new Set(["pred1", "pred2"]),
              phis: [
                {
                  kind: "phi",
                  sources: new Map([
                    [
                      "pred1",
                      {
                        kind: "temp",
                        id: "t1",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                    [
                      "pred2",
                      {
                        kind: "temp",
                        id: "t2",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                  ]),
                  dest: "t3",
                  type: Ir.Type.Scalar.uint256,
                  operationDebug: {},
                },
                {
                  kind: "phi",
                  sources: new Map([
                    [
                      "pred1",
                      { kind: "const", value: true, type: Ir.Type.Scalar.bool },
                    ],
                    [
                      "pred2",
                      {
                        kind: "const",
                        value: false,
                        type: Ir.Type.Scalar.bool,
                      },
                    ],
                  ]),
                  dest: "t4",
                  type: Ir.Type.Scalar.bool,
                  operationDebug: {},
                },
              ],
              debug: {},
            },
          ],
        ]),
      },
    };

    const formatter = new Formatter();
    const formatted = formatter.format(module);

    // Should format both phi nodes
    const phiLines = formatted
      .split("\n")
      .filter((line) => line.includes("phi"));
    expect(phiLines.length).toBe(2);

    // Check for both destinations
    expect(formatted).toContain("%t3");
    expect(formatted).toContain("%t4");
  });

  it("should show block predecessors when there are phi nodes", () => {
    const module: Ir.Module = {
      name: "TestModule",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "merge",
            {
              id: "merge",
              instructions: [],
              terminator: {
                kind: "return",
                operationDebug: {},
              },
              predecessors: new Set(["block1", "block2", "block3"]),
              phis: [
                {
                  kind: "phi",
                  sources: new Map([
                    [
                      "block1",
                      {
                        kind: "temp",
                        id: "t1",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                    [
                      "block2",
                      {
                        kind: "temp",
                        id: "t2",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                    [
                      "block3",
                      {
                        kind: "temp",
                        id: "t3",
                        type: Ir.Type.Scalar.uint256,
                      },
                    ],
                  ]),
                  dest: "t4",
                  type: Ir.Type.Scalar.uint256,
                  operationDebug: {},
                },
              ],
              debug: {},
            },
          ],
        ]),
      },
    };

    const formatter = new Formatter();
    const formatted = formatter.format(module);

    // Should show predecessors in the block header
    expect(formatted).toMatch(/merge\s+preds=\[block1, block2, block3\]/);
  });
});
