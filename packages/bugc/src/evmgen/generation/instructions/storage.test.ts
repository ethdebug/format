import { describe, it, expect } from "vitest";

import * as Ir from "#ir";
import { Memory, Layout } from "#evmgen/analysis";

import { generate } from "../function.js";

/**
 * Helper to generate bytecode for a function with given
 * instructions and return the mnemonic sequence.
 */
function mnemonicsFor(
  instructions: Ir.Instruction[],
  allocations: Record<string, { offset: number; size: number }> = {},
): string[] {
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
          instructions,
          terminator: { kind: "return", operationDebug: {} },
          predecessors: new Set(),
          debug: {},
        } as Ir.Block,
      ],
    ]),
  };

  const memory: Memory.Function.Info = {
    allocations,
    nextStaticOffset: 0x80,
  };

  const layout: Layout.Function.Info = {
    order: ["entry"],
    offsets: new Map(),
  };

  const { instructions: evmInstructions } = generate(func, memory, layout);

  return evmInstructions.map((i) => i.mnemonic);
}

describe("generateRead", () => {
  describe("calldata reads", () => {
    it("should use CALLDATALOAD for full 32-byte read", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "read",
          location: "calldata",
          offset: {
            kind: "const",
            value: 0n,
            type: Ir.Type.Scalar.uint256,
          },
          length: {
            kind: "const",
            value: 32n,
            type: Ir.Type.Scalar.uint256,
          },
          type: Ir.Type.Scalar.uint256,
          dest: "%1",
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("CALLDATALOAD");
      expect(mnemonics).not.toContain("CALLDATACOPY");
    });

    it("should use CALLDATALOAD + shift/mask for partial read", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "read",
          location: "calldata",
          offset: {
            kind: "const",
            value: 4n,
            type: Ir.Type.Scalar.uint256,
          },
          length: {
            kind: "const",
            value: 20n,
            type: Ir.Type.Scalar.uint256,
          },
          type: Ir.Type.Scalar.address,
          dest: "%1",
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("CALLDATALOAD");
      expect(mnemonics).toContain("SHR");
      expect(mnemonics).toContain("AND");
    });
  });

  describe("returndata reads", () => {
    it("should use RETURNDATACOPY + MLOAD", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "read",
          location: "returndata",
          offset: {
            kind: "const",
            value: 0n,
            type: Ir.Type.Scalar.uint256,
          },
          length: {
            kind: "const",
            value: 32n,
            type: Ir.Type.Scalar.uint256,
          },
          type: Ir.Type.Scalar.uint256,
          dest: "%1",
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("RETURNDATACOPY");
      expect(mnemonics).toContain("MLOAD");
      // Should zero scratch memory first
      expect(mnemonics).toContain("MSTORE");
    });
  });

  describe("code reads", () => {
    it("should use CODECOPY + MLOAD", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "read",
          location: "code",
          offset: {
            kind: "const",
            value: 0n,
            type: Ir.Type.Scalar.uint256,
          },
          length: {
            kind: "const",
            value: 32n,
            type: Ir.Type.Scalar.uint256,
          },
          type: Ir.Type.Scalar.uint256,
          dest: "%1",
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("CODECOPY");
      expect(mnemonics).toContain("MLOAD");
    });
  });

  describe("transient storage reads", () => {
    it("should use TLOAD", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "read",
          location: "transient",
          slot: {
            kind: "const",
            value: 0n,
            type: Ir.Type.Scalar.uint256,
          },
          type: Ir.Type.Scalar.uint256,
          dest: "%1",
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("TLOAD");
    });
  });
});

describe("generateWrite", () => {
  describe("transient storage writes", () => {
    it("should use TSTORE", () => {
      const mnemonics = mnemonicsFor([
        {
          kind: "write",
          location: "transient",
          slot: {
            kind: "const",
            value: 0n,
            type: Ir.Type.Scalar.uint256,
          },
          value: {
            kind: "const",
            value: 42n,
            type: Ir.Type.Scalar.uint256,
          },
          operationDebug: {},
        },
      ]);

      expect(mnemonics).toContain("TSTORE");
    });
  });
});
