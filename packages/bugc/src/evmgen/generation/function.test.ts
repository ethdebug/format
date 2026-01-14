import { describe, it, expect } from "vitest";

import * as Ir from "#ir";
import { Memory, Liveness, Layout } from "#evmgen/analysis";

import { generate } from "./function.js";

describe("Function.generate", () => {
  it("should generate bytecode for simple constants", () => {
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
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {},
      nextStaticOffset: 0x80,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have memory initialization (PUSH1 0x80, PUSH1 0x40, MSTORE) followed by PUSH1 42
    // No JUMPDEST for entry with no predecessors, no STOP since it's the last block
    expect(instructions).toHaveLength(4);
    expect(instructions[0]).toMatchObject({
      mnemonic: "PUSH1",
      immediates: [0x80],
    });
    expect(instructions[1]).toMatchObject({
      mnemonic: "PUSH1",
      immediates: [0x40],
    });
    expect(instructions[2]).toMatchObject({
      mnemonic: "MSTORE",
    });
    expect(instructions[3]).toMatchObject({
      mnemonic: "PUSH1",
      immediates: [42],
    });
  });

  it("should handle SSA temporary operations", () => {
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
              // In SSA form, we don't have store_local/load_local
              // %1 is directly used where needed
              {
                kind: "const",
                value: 1n,
                type: Ir.Type.Scalar.uint256,
                dest: "%3",
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
                  id: "%3",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%4",
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
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    // In SSA form, temporaries are directly used without locals
    // The memory planner allocates values that need to persist across stack operations

    const { instructions } = generate(func, memory, layout);

    // Should contain the constants and ADD operation
    expect(instructions.some((inst) => inst.mnemonic === "ADD")).toBe(true);
  });

  it.skip("should generate slice operation with MCOPY - REMOVED SLICE INSTRUCTION", () => {
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
                value: 0x100n, // Array pointer in memory
                type: Ir.Type.Ref.memory(),
                dest: "%1",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 2n, // Start index
                type: Ir.Type.Scalar.uint256,
                dest: "%2",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 5n, // End index
                type: Ir.Type.Scalar.uint256,
                dest: "%3",
                operationDebug: {},
              },
              {
                kind: "slice",
                object: {
                  kind: "temp",
                  id: "%1",
                  type: Ir.Type.Ref.memory(),
                },
                start: {
                  kind: "temp",
                  id: "%2",
                  type: Ir.Type.Scalar.uint256,
                },
                end: {
                  kind: "temp",
                  id: "%3",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%4",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%4",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = generate(func, memory, layout);

    // Should contain:
    // 1. Memory initialization (PUSH 0x80, PUSH 0x40, MSTORE)
    // 2. Loading start and end indices
    // 3. SUB to calculate length
    // 4. MUL by 32 to get byte size
    // 5. Memory allocation (updating free memory pointer)
    // 6. MCOPY for the actual copy
    // 7. Return sequence

    // Check for key instructions
    const mnemonics = instructions.map((inst) => inst.mnemonic);

    // Should have SUB for length calculation
    expect(mnemonics).toContain("SUB");

    // Should have MUL for byte size calculation
    expect(mnemonics).toContain("MUL");

    // Should have MLOAD for reading free memory pointer
    expect(mnemonics).toContain("MLOAD");

    // Should have MCOPY for the memory copy
    expect(mnemonics).toContain("MCOPY");

    // Should have RETURN since we're returning a value
    expect(mnemonics).toContain("RETURN");
  });

  it("should generate binary operations", () => {
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
                value: 10n,
                type: Ir.Type.Scalar.uint256,
                dest: "%1",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 20n,
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

    const memory: Memory.Function.Info = {
      allocations: {
        "%1": makeAllocation(0x80),
        "%2": makeAllocation(0xa0),
        "%3": makeAllocation(0xc0),
      },
      nextStaticOffset: 0xe0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should contain ADD instruction
    expect(instructions.some((inst) => inst.mnemonic === "ADD")).toBe(true);

    // Should have memory stores (MSTORE instructions)
    expect(instructions.some((inst) => inst.mnemonic === "MSTORE")).toBe(true);
  });

  it("should handle jumps between blocks", () => {
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
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {},
      nextStaticOffset: 0x80,
    };

    const layout: Layout.Function.Info = {
      order: ["entry", "next"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have JUMP instruction
    expect(instructions.some((inst) => inst.mnemonic === "JUMP")).toBe(true);

    // Should have one JUMPDEST (only for the 'next' block which is jumped to)
    const jumpdests = instructions.filter(
      (inst) => inst.mnemonic === "JUMPDEST",
    );
    expect(jumpdests).toHaveLength(1);

    // Should have PUSH2 for jump target
    const push2Instructions = instructions.filter(
      (inst) => inst.mnemonic === "PUSH2",
    );
    expect(push2Instructions).toHaveLength(1);

    // Target should be patched (not [0, 0])
    const push2 = push2Instructions[0];
    expect(push2.immediates).toBeDefined();
    expect(push2.immediates!.length).toBe(2);
    const target = (push2.immediates![0] << 8) | push2.immediates![1];
    expect(target).toBeGreaterThan(0);
  });

  it("should handle conditional branches", () => {
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
                type: Ir.Type.Scalar.bool,
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
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
        [
          "else",
          {
            id: "else",
            phis: [],
            instructions: [],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(["entry"]),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: { "%cond": { offset: 0x80, size: 32 } },
      nextStaticOffset: 0xa0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry", "then", "else"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have JUMPI for conditional jump
    expect(instructions.some((inst) => inst.mnemonic === "JUMPI")).toBe(true);

    // Should have PUSH2 instructions for both targets
    const push2Instructions = instructions.filter(
      (inst) => inst.mnemonic === "PUSH2",
    );
    expect(push2Instructions.length).toBe(2);

    // Should have JUMP for unconditional fallthrough
    expect(instructions.some((inst) => inst.mnemonic === "JUMP")).toBe(true);
  });

  it("should handle storage operations", () => {
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
                dest: "%slot",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 42n,
                type: Ir.Type.Scalar.uint256,
                dest: "%value",
                operationDebug: {},
              },
              {
                kind: "write",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%slot",
                  type: Ir.Type.Scalar.uint256,
                },
                value: {
                  kind: "temp",
                  id: "%value",
                  type: Ir.Type.Scalar.uint256,
                },
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

    const memory: Memory.Function.Info = {
      allocations: {
        "%slot": { offset: 0x80, size: 32 },
        "%value": { offset: 0xa0, size: 32 },
      },
      nextStaticOffset: 0xc0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have SSTORE instruction
    expect(instructions.some((inst) => inst.mnemonic === "SSTORE")).toBe(true);
  });

  it("should handle environment operations", () => {
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
                kind: "env",
                op: "msg_sender",
                dest: "%sender",
                operationDebug: {},
              },
              {
                kind: "env",
                op: "msg_value",
                dest: "%value",
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

    const memory: Memory.Function.Info = {
      allocations: {
        "%sender": { offset: 0x80, size: 20 },
        "%value": { offset: 0xa0, size: 32 },
      },
      nextStaticOffset: 0xc0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have CALLER and CALLVALUE instructions
    expect(instructions.some((inst) => inst.mnemonic === "CALLER")).toBe(true);
    expect(instructions.some((inst) => inst.mnemonic === "CALLVALUE")).toBe(
      true,
    );
  });

  it("should handle array slot computation", () => {
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
                dest: "%value",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 3n,
                type: Ir.Type.Scalar.uint256,
                dest: "%index",
                operationDebug: {},
              },
              {
                kind: "compute_slot",
                slotKind: "array",
                base: {
                  kind: "const",
                  value: 0n,
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%first_slot",
                operationDebug: {},
              },
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%first_slot",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%index",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%slot",
                operationDebug: {},
              },
              {
                kind: "write",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%slot",
                  type: Ir.Type.Scalar.uint256,
                },
                value: {
                  kind: "temp",
                  id: "%value",
                  type: Ir.Type.Scalar.uint256,
                },
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

    const memory: Memory.Function.Info = {
      allocations: {
        "%value": { offset: 0x80, size: 32 },
        "%index": { offset: 0xa0, size: 32 },
        "%first_slot": { offset: 0xc0, size: 32 },
        "%slot": { offset: 0xe0, size: 32 },
      },
      nextStaticOffset: 0x100,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should contain KECCAK256 for array slot computation
    expect(instructions.some((inst) => inst.mnemonic === "KECCAK256")).toBe(
      true,
    );

    // Should contain MSTORE instructions for hash setup
    const mstores = instructions.filter((inst) => inst.mnemonic === "MSTORE");
    expect(mstores.length).toBeGreaterThanOrEqual(1);

    // Should contain ADD for index offset
    expect(instructions.some((inst) => inst.mnemonic === "ADD")).toBe(true);

    // Should contain SSTORE for storage write
    expect(instructions.some((inst) => inst.mnemonic === "SSTORE")).toBe(true);
  });

  it("should handle array element load", () => {
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
                value: 2n,
                type: Ir.Type.Scalar.uint256,
                dest: "%index",
                operationDebug: {},
              },
              {
                kind: "compute_slot",
                slotKind: "array",
                base: {
                  kind: "const",
                  value: 0n,
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%first_slot",
                operationDebug: {},
              },
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%first_slot",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%index",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%slot",
                operationDebug: {},
              },
              {
                kind: "read",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%slot",
                  type: Ir.Type.Scalar.uint256,
                },
                type: Ir.Type.Scalar.uint256,
                dest: "%value",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%value",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {
        "%index": { offset: 0x80, size: 32 },
        "%first_slot": { offset: 0xa0, size: 32 },
        "%slot": { offset: 0xc0, size: 32 },
        "%value": { offset: 0xe0, size: 32 },
      },
      nextStaticOffset: 0x100,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should compute array base with KECCAK256
    expect(instructions.some((inst) => inst.mnemonic === "KECCAK256")).toBe(
      true,
    );

    // Should add index to base
    expect(instructions.some((inst) => inst.mnemonic === "ADD")).toBe(true);

    // Should load from storage
    expect(instructions.some((inst) => inst.mnemonic === "SLOAD")).toBe(true);

    // No STOP at the end since it's the last block
    expect(instructions.some((inst) => inst.mnemonic === "STOP")).toBe(false);
  });

  it("should handle mapping slot computation", () => {
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
                kind: "env",
                op: "msg_sender",
                dest: "%sender",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 100n,
                type: Ir.Type.Scalar.uint256,
                dest: "%value",
                operationDebug: {},
              },
              {
                kind: "compute_slot",
                slotKind: "mapping",
                base: {
                  kind: "const",
                  value: 1n,
                  type: Ir.Type.Scalar.uint256,
                },
                key: {
                  kind: "temp",
                  id: "%sender",
                  type: Ir.Type.Scalar.address,
                },
                keyType: { kind: "address" },
                dest: "%slot",
                operationDebug: {},
              },
              {
                kind: "write",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%slot",
                  type: Ir.Type.Scalar.uint256,
                },
                value: {
                  kind: "temp",
                  id: "%value",
                  type: Ir.Type.Scalar.uint256,
                },
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

    const memory: Memory.Function.Info = {
      allocations: {
        "%sender": { offset: 0x80, size: 20 },
        "%value": { offset: 0xa0, size: 32 },
        "%slot": { offset: 0xc0, size: 32 },
      },
      nextStaticOffset: 0xe0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have CALLER for msg.sender
    expect(instructions.some((inst) => inst.mnemonic === "CALLER")).toBe(true);

    // Should have KECCAK256 for mapping slot computation
    expect(instructions.some((inst) => inst.mnemonic === "KECCAK256")).toBe(
      true,
    );

    // Should have SSTORE for final storage
    expect(instructions.some((inst) => inst.mnemonic === "SSTORE")).toBe(true);
  });

  it("should handle mapping value load", () => {
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
                kind: "env",
                op: "msg_sender",
                dest: "%sender",
                operationDebug: {},
              },
              {
                kind: "compute_slot",
                slotKind: "mapping",
                base: {
                  kind: "const",
                  value: 1n,
                  type: Ir.Type.Scalar.uint256,
                },
                key: {
                  kind: "temp",
                  id: "%sender",
                  type: Ir.Type.Scalar.address,
                },
                keyType: { kind: "address" },
                dest: "%slot",
                operationDebug: {},
              },
              {
                kind: "read",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%slot",
                  type: Ir.Type.Scalar.uint256,
                },
                type: Ir.Type.Scalar.uint256,
                dest: "%balance",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%balance",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {
        "%sender": { offset: 0x80, size: 20 },
        "%slot": { offset: 0xa0, size: 32 },
        "%balance": { offset: 0xc0, size: 32 },
      },
      nextStaticOffset: 0xe0,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should get msg.sender
    expect(instructions.some((inst) => inst.mnemonic === "CALLER")).toBe(true);

    // Should compute slot with KECCAK256
    expect(instructions.some((inst) => inst.mnemonic === "KECCAK256")).toBe(
      true,
    );

    // Should load from storage
    expect(instructions.some((inst) => inst.mnemonic === "SLOAD")).toBe(true);

    // Should have proper memory operations for hash
    const mstores = instructions.filter((inst) => inst.mnemonic === "MSTORE");
    expect(mstores.length).toBeGreaterThanOrEqual(2); // For key and baseSlot
  });

  it("should handle nested array/mapping access", () => {
    // Test something like: mapping<address, array<uint256>>
    // users[msg.sender][index]
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
                kind: "env",
                op: "msg_sender",
                dest: "%sender",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 5n,
                type: Ir.Type.Scalar.uint256,
                dest: "%index",
                operationDebug: {},
              },
              // First compute mapping slot for users[msg.sender]
              {
                kind: "compute_slot",
                slotKind: "mapping",
                base: {
                  kind: "const",
                  value: 0n,
                  type: Ir.Type.Scalar.uint256,
                },
                key: {
                  kind: "temp",
                  id: "%sender",
                  type: Ir.Type.Scalar.address,
                },
                keyType: { kind: "address" },
                dest: "%userSlot",
                operationDebug: {},
              },
              // Then compute array first slot
              {
                kind: "compute_slot",
                slotKind: "array",
                base: {
                  kind: "temp",
                  id: "%userSlot",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%arrayFirstSlot",
                operationDebug: {},
              },
              // Add the index
              {
                kind: "binary",
                op: "add",
                left: {
                  kind: "temp",
                  id: "%arrayFirstSlot",
                  type: Ir.Type.Scalar.uint256,
                },
                right: {
                  kind: "temp",
                  id: "%index",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%finalSlot",
                operationDebug: {},
              },
              {
                kind: "read",
                location: "storage",
                slot: {
                  kind: "temp",
                  id: "%finalSlot",
                  type: Ir.Type.Scalar.uint256,
                },
                type: Ir.Type.Scalar.uint256,
                dest: "%value",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%value",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {
        "%sender": { offset: 0x80, size: 20 },
        "%index": { offset: 0xa0, size: 32 },
        "%userSlot": { offset: 0xc0, size: 32 },
        "%arrayFirstSlot": { offset: 0xe0, size: 32 },
        "%finalSlot": { offset: 0x100, size: 32 },
        "%value": { offset: 0x120, size: 32 },
      },
      nextStaticOffset: 0x140,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Should have KECCAK256 operations for both mapping and array
    const keccakInstructions = instructions.filter(
      (inst) => inst.mnemonic === "KECCAK256",
    );
    // We expect at least 2 (one for mapping, one for array)
    expect(keccakInstructions.length).toBeGreaterThanOrEqual(2);

    // Should have ADD for index offset
    expect(instructions.some((inst) => inst.mnemonic === "ADD")).toBe(true);

    // Should load from storage
    expect(instructions.some((inst) => inst.mnemonic === "SLOAD")).toBe(true);
  });

  it.skip("should handle slice with zero length - REMOVED SLICE INSTRUCTION", () => {
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
                value: 0x100n, // Array pointer
                type: Ir.Type.Ref.memory(),
                dest: "%1",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 3n, // Start index
                type: Ir.Type.Scalar.uint256,
                dest: "%2",
                operationDebug: {},
              },
              {
                kind: "const",
                value: 3n, // End index (same as start = empty slice)
                type: Ir.Type.Scalar.uint256,
                dest: "%3",
                operationDebug: {},
              },
              {
                kind: "slice",
                object: {
                  kind: "temp",
                  id: "%1",
                  type: Ir.Type.Ref.memory(),
                },
                start: {
                  kind: "temp",
                  id: "%2",
                  type: Ir.Type.Scalar.uint256,
                },
                end: {
                  kind: "temp",
                  id: "%3",
                  type: Ir.Type.Scalar.uint256,
                },
                dest: "%4",
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
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = generate(func, memory, layout);

    // Should still have MCOPY even for zero-length copy
    // (though it will copy 0 bytes)
    const mnemonics = instructions.map((inst) => inst.mnemonic);
    expect(mnemonics).toContain("MCOPY");
  });

  it.skip("should handle slice operation on calldata (msg.data) - REMOVED SLICE INSTRUCTION", () => {
    // Test removed - slice instruction no longer exists in IR
    // Slicing is now done through decomposed operations (sub, add, allocate, read, write)
  });

  it("should handle msg.data.length using CALLDATASIZE", () => {
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
            predecessors: new Set<string>(),
            instructions: [
              {
                kind: "env",
                op: "msg_data",
                dest: "%msg_data",
                operationDebug: {},
              },
              {
                kind: "length",
                object: {
                  kind: "temp",
                  id: "%msg_data",
                  type: Ir.Type.Ref.calldata(),
                },
                dest: "%data_length",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%data_length",
                type: Ir.Type.Scalar.uint256,
              },
              operationDebug: {},
            },
            debug: {},
          },
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = generate(func, memory, layout);
    const mnemonics = instructions.map((inst) => inst.mnemonic);

    // Should have PUSH0 for msg.data
    expect(mnemonics).toContain("PUSH0");

    // Should have CALLDATASIZE for getting the length
    expect(mnemonics).toContain("CALLDATASIZE");

    // Should NOT have SLOAD (not storage array length)
    expect(mnemonics).not.toContain("SLOAD");
  });

  it.skip("should handle slice operation on bytes - REMOVED SLICE INSTRUCTION", () => {
    // Test removed - slice instruction no longer exists in IR
    // Slicing is now done through decomposed operations (sub, add, allocate, read, write)
  });

  it("should handle string constants with UTF-8 encoding", () => {
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
            predecessors: new Set<string>(),
            instructions: [
              {
                kind: "const",
                value: "Hello, world!",
                type: Ir.Type.Ref.memory(),
                dest: "%greeting",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%greeting",
                type: Ir.Type.Ref.memory(),
              },
              operationDebug: {},
            },
            debug: {},
          },
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = generate(func, memory, layout);
    const mnemonics = instructions.map((inst) => inst.mnemonic);

    // Should allocate memory for the string
    expect(mnemonics).toContain("MLOAD"); // Loading free memory pointer
    expect(mnemonics).toContain("MSTORE"); // Storing length and data

    // Should have pushed the string length (13 bytes for "Hello, world!")
    const pushInstructions = instructions.filter((inst) =>
      inst.mnemonic.startsWith("PUSH"),
    );
    const hasLengthValue = pushInstructions.some(
      (inst) => inst.immediates && inst.immediates[0] === 13,
    );
    expect(hasLengthValue).toBe(true);
  });

  it("should handle UTF-8 multi-byte characters correctly", () => {
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
            predecessors: new Set<string>(),
            instructions: [
              {
                kind: "const",
                value: "Hello 世界! 😊", // Mix of ASCII, Chinese, and emoji
                type: Ir.Type.Ref.memory(),
                dest: "%greeting",
                operationDebug: {},
              },
            ],
            terminator: {
              kind: "return",
              value: {
                kind: "temp",
                id: "%greeting",
                type: Ir.Type.Ref.memory(),
              },
              operationDebug: {},
            },
            debug: {},
          },
        ],
      ]),
    };

    const liveness = Liveness.Function.analyze(func);
    const memoryResult = Memory.Function.plan(func, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(func);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = generate(func, memory, layout);
    const mnemonics = instructions.map((inst) => inst.mnemonic);

    // Should allocate memory for the string
    expect(mnemonics).toContain("MLOAD"); // Loading free memory pointer
    expect(mnemonics).toContain("MSTORE"); // Storing length and data

    // The UTF-8 byte length should be:
    // "Hello " = 6 bytes
    // "世界" = 6 bytes (3 bytes each for the Chinese characters)
    // "! " = 2 bytes
    // "😊" = 4 bytes (emoji)
    // Total = 18 bytes
    const pushInstructions = instructions.filter((inst) =>
      inst.mnemonic.startsWith("PUSH"),
    );
    const hasLengthValue = pushInstructions.some(
      (inst) => inst.immediates && inst.immediates[0] === 18,
    );
    expect(hasLengthValue).toBe(true);
  });

  it("should attach debug context to generated instructions", () => {
    const debugContext = {
      context: {
        remark: "test debug context",
      },
    };

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
                operationDebug: debugContext,
              },
            ],
            terminator: { kind: "return", operationDebug: {} },
            predecessors: new Set(),
            debug: {},
          } as Ir.Block,
        ],
      ]),
    };

    const memory: Memory.Function.Info = {
      allocations: {},
      nextStaticOffset: 0x80,
    };

    const layout: Layout.Function.Info = {
      order: ["entry"],
      offsets: new Map(),
    };

    const { instructions } = generate(func, memory, layout);

    // Find the PUSH1 42 instruction
    const push42 = instructions.find(
      (inst) => inst.mnemonic === "PUSH1" && inst.immediates?.[0] === 42,
    );

    expect(push42).toBeDefined();
    expect(push42?.debug).toEqual(debugContext);
  });
});

// Helper to create memory allocations for tests
function makeAllocation(offset: number, size: number = 32): Memory.Allocation {
  return { offset, size };
}
