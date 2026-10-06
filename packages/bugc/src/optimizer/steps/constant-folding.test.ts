import { describe, it, expect } from "vitest";

import * as Ir from "#ir";

import { ConstantFoldingStep } from "./constant-folding.js";
import { type OptimizationContext } from "../optimizer.js";

describe("ConstantFoldingStep", () => {
  const step = new ConstantFoldingStep();

  function createTestModule(instructions: Ir.Instruction[]): Ir.Module {
    const block: Ir.Block = {
      id: "entry",
      phis: [],
      instructions,
      terminator: { kind: "return", operationDebug: {} },
      predecessors: new Set<string>(),
      debug: {},
    };

    return {
      name: "test",
      sourceId: "test",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([["entry", block]]),
      },
    };
  }

  it("should fold keccak256 on string constants", () => {
    const module = createTestModule([
      {
        kind: "const",
        value: "transfer(address,uint256)",
        type: Ir.Type.Scalar.uint256,
        dest: "t0",
        operationDebug: {},
      },
      {
        kind: "hash",
        value: { kind: "temp", id: "t0", type: Ir.Type.Scalar.uint256 },
        dest: "t1",
        operationDebug: {},
      },
    ]);

    const context: OptimizationContext = {
      trackTransformation: () => {},
      getTransformations: () => [],
      getAnalysis: () => undefined,
      setAnalysis: () => {},
    };

    const optimized = step.run(module, context);
    const block = optimized.main.blocks.get("entry")!;

    expect(block.instructions).toHaveLength(2);
    expect(block.instructions[1]).toMatchObject({
      kind: "const",
      // This is keccak256("transfer(address,uint256)")
      value:
        76450787364331811106618268332334209071204572358820727073668507032443496760475n,
      type: Ir.Type.Scalar.bytes32,
      dest: "t1",
    });
  });

  it("should not fold keccak256 on non-constant values", () => {
    const module = createTestModule([
      {
        kind: "const",
        value: 123n,
        type: Ir.Type.Scalar.uint256,
        dest: "t0",
        operationDebug: {},
      },
      {
        kind: "hash",
        value: { kind: "temp", id: "t0", type: Ir.Type.Scalar.uint256 },
        dest: "t1",
        operationDebug: {},
      },
    ]);

    const context: OptimizationContext = {
      trackTransformation: () => {},
      getTransformations: () => [],
      getAnalysis: () => undefined,
      setAnalysis: () => {},
    };

    const optimized = step.run(module, context);
    const block = optimized.main.blocks.get("entry")!;

    expect(block.instructions).toHaveLength(2);
    expect(block.instructions[1]).toMatchObject({
      kind: "hash",
      value: { kind: "temp", id: "t0" },
      dest: "t1",
    });
  });

  it("should fold multiple hash operations", () => {
    const module = createTestModule([
      {
        kind: "const",
        value: "pause()",
        type: Ir.Type.Scalar.uint256,
        dest: "t0",
        operationDebug: {},
      },
      {
        kind: "hash",
        value: { kind: "temp", id: "t0", type: Ir.Type.Scalar.uint256 },
        dest: "t1",
        operationDebug: {},
      },
      {
        kind: "const",
        value: "unpause()",
        type: Ir.Type.Scalar.uint256,
        dest: "t2",
        operationDebug: {},
      },
      {
        kind: "hash",
        value: { kind: "temp", id: "t2", type: Ir.Type.Scalar.uint256 },
        dest: "t3",
        operationDebug: {},
      },
    ]);

    const context: OptimizationContext = {
      trackTransformation: () => {},
      getTransformations: () => [],
      getAnalysis: () => undefined,
      setAnalysis: () => {},
    };

    const optimized = step.run(module, context);
    const block = optimized.main.blocks.get("entry")!;

    expect(block.instructions).toHaveLength(4);

    // Check that both hash instructions were folded
    expect(block.instructions[1]).toMatchObject({
      kind: "const",
      type: Ir.Type.Scalar.bytes32,
      dest: "t1",
    });

    expect(block.instructions[3]).toMatchObject({
      kind: "const",
      type: Ir.Type.Scalar.bytes32,
      dest: "t3",
    });
  });

  describe("mod", () => {
    function foldMod(left: bigint, right: bigint) {
      const uint = Ir.Type.Scalar.uint256;
      const module = createTestModule([
        {
          kind: "const",
          value: left,
          type: uint,
          dest: "t0",
          operationDebug: {},
        },
        {
          kind: "const",
          value: right,
          type: uint,
          dest: "t1",
          operationDebug: {},
        },
        {
          kind: "binary",
          op: "mod",
          left: { kind: "temp", id: "t0", type: uint },
          right: { kind: "temp", id: "t1", type: uint },
          dest: "t2",
          operationDebug: {},
        },
      ]);
      const context: OptimizationContext = {
        trackTransformation: () => {},
        getTransformations: () => [],
        getAnalysis: () => undefined,
        setAnalysis: () => {},
      };
      return step.run(module, context).main.blocks.get("entry")!
        .instructions[2];
    }

    it("should fold constant operands", () => {
      expect(foldMod(1071n, 462n)).toMatchObject({
        kind: "const",
        value: 147n,
        dest: "t2",
      });
    });

    it("should leave a zero divisor to run time", () => {
      expect(foldMod(7n, 0n)).toMatchObject({ kind: "binary", op: "mod" });
    });
  });

  const context: OptimizationContext = {
    trackTransformation: () => {},
    getTransformations: () => [],
    getAnalysis: () => undefined,
    setAnalysis: () => {},
  };

  const uint = (value: bigint): Ir.Value =>
    Ir.Value.constant(value, Ir.Type.Scalar.uint256);

  it("should remove an assert only if its condition is a true constant", () => {
    const assert = (condition: Ir.Value): Ir.Instruction => ({
      kind: "assert",
      condition,
      panic: 0x32,
      operationDebug: {},
    });
    const module = createTestModule([
      {
        kind: "binary",
        op: "lt",
        left: uint(2n),
        right: uint(3n),
        dest: "t0",
        operationDebug: {},
      },
      assert(Ir.Value.temp("t0", Ir.Type.Scalar.bool)),
      {
        kind: "binary",
        op: "lt",
        left: uint(3n),
        right: uint(3n),
        dest: "t1",
        operationDebug: {},
      },
      assert(Ir.Value.temp("t1", Ir.Type.Scalar.bool)),
      assert(Ir.Value.temp("t2", Ir.Type.Scalar.bool)),
    ]);

    const block = step.run(module, context).main.blocks.get("entry")!;

    expect(block.instructions.map((inst) => inst.kind)).toEqual([
      "const",
      "const",
      "assert",
      "assert",
    ]);
  });
});
