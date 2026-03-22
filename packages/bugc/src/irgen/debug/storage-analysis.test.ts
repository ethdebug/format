/**
 * Unit tests for storage slot computation analysis
 *
 * Tests the chain walking and pointer generation for sophisticated
 * storage access patterns (mappings, arrays, structs)
 */

import { describe, it, expect } from "vitest";
import * as Ir from "#ir";
import * as Ast from "#ast";
import {
  findComputeSlotChain,
  findBaseStorageVariable,
  analyzeStorageSlot,
  type ComputeSlotChain,
} from "./storage-analysis.js";
import { translateComputeSlotChain } from "./pointers.js";

/**
 * Helper to create a minimal IR block with compute_slot instructions
 */
function createBlockWithInstructions(instructions: Ir.Instruction[]): Ir.Block {
  return {
    id: "test_block",
    phis: [],
    instructions,
    terminator: { kind: "return", operationDebug: {} },
    predecessors: new Set(),
    debug: {},
  };
}

/**
 * Helper to create a compute_slot instruction for mapping access
 */
function createMappingSlot(
  dest: string,
  base: Ir.Value,
  key: Ir.Value,
): Ir.Instruction.ComputeSlot {
  return {
    kind: "compute_slot",
    dest,
    slotKind: "mapping",
    base,
    key,
    keyType: Ir.Type.Scalar.uint256,
    operationDebug: {},
  };
}

/**
 * Helper to create a compute_slot instruction for array access
 */
function createArraySlot(
  dest: string,
  base: Ir.Value,
): Ir.Instruction.ComputeSlot {
  return {
    kind: "compute_slot",
    dest,
    slotKind: "array",
    base,
    operationDebug: {},
  };
}

/**
 * Helper to create a compute_slot instruction for struct field access
 */
function createFieldSlot(
  dest: string,
  base: Ir.Value,
  fieldOffset: number,
): Ir.Instruction.ComputeSlot {
  return {
    kind: "compute_slot",
    dest,
    slotKind: "field",
    base,
    fieldOffset,
    operationDebug: {},
  };
}

/**
 * Helper to create a const value
 */
function constValue(value: number | bigint): Ir.Value {
  return {
    kind: "const",
    value: typeof value === "number" ? BigInt(value) : value,
    type: Ir.Type.Scalar.uint256,
  };
}

/**
 * Helper to create a temp reference
 */
function tempValue(id: string): Ir.Value {
  return {
    kind: "temp",
    id,
    type: Ir.Type.Scalar.uint256,
  };
}

describe("storage-analysis", () => {
  describe("findComputeSlotChain", () => {
    it("should find simple mapping access chain", () => {
      // balances[addr] where balances is at slot 0
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(0), constValue(0x1234)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();
      expect(chain!.baseSlot).toBe(0);
      expect(chain!.steps).toHaveLength(1);
      expect(chain!.steps[0].instruction.slotKind).toBe("mapping");
      expect(chain!.steps[0].destTemp).toBe("t1");
    });

    it("should find nested mapping access chain", () => {
      // allowances[sender][spender] where allowances is at slot 1
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(1), constValue(0xaaaa)),
        createMappingSlot("t2", tempValue("t1"), constValue(0xbbbb)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t2");

      expect(chain).not.toBeNull();
      expect(chain!.baseSlot).toBe(1);
      expect(chain!.steps).toHaveLength(2);
      expect(chain!.steps[0].instruction.slotKind).toBe("mapping");
      expect(chain!.steps[1].instruction.slotKind).toBe("mapping");
    });

    it("should find array element access chain", () => {
      // items[5] where items is at slot 2
      const instructions: Ir.Instruction[] = [
        createArraySlot("t1", constValue(2)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();
      expect(chain!.baseSlot).toBe(2);
      expect(chain!.steps).toHaveLength(1);
      expect(chain!.steps[0].instruction.slotKind).toBe("array");
    });

    it("should find struct field access chain", () => {
      // account.balance where account is at slot 3, balance at offset 32
      const instructions: Ir.Instruction[] = [
        createFieldSlot("t1", constValue(3), 32),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();
      expect(chain!.baseSlot).toBe(3);
      expect(chain!.steps).toHaveLength(1);
      expect(chain!.steps[0].instruction.slotKind).toBe("field");
      expect(chain!.steps[0].fieldSlotOffset).toBe(1); // 32 bytes / 32
    });

    it("should find complex nested access chain", () => {
      // accounts[user].balance where accounts is at slot 4
      // First: mapping access for accounts[user]
      // Then: field access for .balance (offset 64)
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(4), constValue(0xabcd)),
        createFieldSlot("t2", tempValue("t1"), 64),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t2");

      expect(chain).not.toBeNull();
      expect(chain!.baseSlot).toBe(4);
      expect(chain!.steps).toHaveLength(2);
      expect(chain!.steps[0].instruction.slotKind).toBe("mapping");
      expect(chain!.steps[1].instruction.slotKind).toBe("field");
      expect(chain!.steps[1].fieldSlotOffset).toBe(2); // 64 bytes / 32
    });

    it("should return null if temp not found", () => {
      const block = createBlockWithInstructions([]);
      const chain = findComputeSlotChain(block, "nonexistent");

      expect(chain).toBeNull();
    });

    it("should return null if temp is not from compute_slot", () => {
      // Create a different instruction kind that produces a temp
      const instructions: Ir.Instruction[] = [
        {
          kind: "binary",
          dest: "t1",
          op: "add",
          left: constValue(1),
          right: constValue(2),
          operationDebug: {},
        },
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      // Should return chain with no steps and null baseSlot
      // because the temp comes from binary.add, not compute_slot
      expect(chain).not.toBeNull();
      expect(chain!.steps).toHaveLength(0);
      expect(chain!.baseSlot).toBeNull();
    });

    it("should handle field offset = 0", () => {
      // First field in a struct (offset 0)
      const instructions: Ir.Instruction[] = [
        createFieldSlot("t1", constValue(5), 0),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();
      expect(chain!.steps[0].fieldSlotOffset).toBe(0);
    });

    it("should limit chain depth", () => {
      // Create a chain longer than MAX_CHAIN_DEPTH (10)
      const instructions: Ir.Instruction[] = [];
      for (let i = 0; i < 15; i++) {
        const base = i === 0 ? constValue(0) : tempValue(`t${i}`);
        instructions.push(createMappingSlot(`t${i + 1}`, base, constValue(i)));
      }

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t15");

      // Should stop at MAX_CHAIN_DEPTH
      expect(chain).not.toBeNull();
      expect(chain!.steps.length).toBeLessThanOrEqual(10);
    });
  });

  describe("findBaseStorageVariable", () => {
    it("should find storage variable by slot", () => {
      const storageDecls: Ast.Declaration.Storage[] = [
        {
          kind: "declaration:storage",
          id: "balances_decl",
          name: "balances",
          slot: 0,
          type: {} as Ast.Type,
          loc: null,
        },
        {
          kind: "declaration:storage",
          id: "allowances_decl",
          name: "allowances",
          slot: 1,
          type: {} as Ast.Type,
          loc: null,
        },
      ];

      const chain: ComputeSlotChain = {
        baseSlot: 0,
        baseVariableName: null,
        steps: [],
      };

      const result = findBaseStorageVariable(chain, storageDecls);

      expect(result).not.toBeNull();
      expect(result!.name).toBe("balances");
      expect(result!.slot).toBe(0);
    });

    it("should return null if slot not found", () => {
      const storageDecls: Ast.Declaration.Storage[] = [
        {
          kind: "declaration:storage",
          id: "balances_decl",
          name: "balances",
          slot: 0,
          type: {} as Ast.Type,
          loc: null,
        },
      ];

      const chain: ComputeSlotChain = {
        baseSlot: 99,
        baseVariableName: null,
        steps: [],
      };

      const result = findBaseStorageVariable(chain, storageDecls);

      expect(result).toBeNull();
    });

    it("should return null if baseSlot is null", () => {
      const storageDecls: Ast.Declaration.Storage[] = [];

      const chain: ComputeSlotChain = {
        baseSlot: null,
        baseVariableName: null,
        steps: [],
      };

      const result = findBaseStorageVariable(chain, storageDecls);

      expect(result).toBeNull();
    });
  });

  describe("analyzeStorageSlot", () => {
    it("should analyze direct constant slot access", () => {
      const storageDecls: Ast.Declaration.Storage[] = [
        {
          kind: "declaration:storage",
          id: "owner_decl",
          name: "owner",
          slot: 0,
          type: {} as Ast.Type,
          loc: null,
        },
      ];

      const block = createBlockWithInstructions([]);
      const slotValue = constValue(0);

      const result = analyzeStorageSlot(slotValue, block, storageDecls);

      expect(result).not.toBeNull();
      expect(result!.variableName).toBe("owner");
      expect(result!.pointer).toMatchObject({
        location: "storage",
        slot: 0,
      });
      expect(result!.chain).toBeUndefined();
    });

    it("should analyze computed slot access", () => {
      const storageDecls: Ast.Declaration.Storage[] = [
        {
          kind: "declaration:storage",
          id: "balances_decl",
          name: "balances",
          slot: 0,
          type: {} as Ast.Type,
          loc: null,
        },
      ];

      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(0), constValue(0x1234)),
      ];

      const block = createBlockWithInstructions(instructions);
      const slotValue = tempValue("t1");

      const result = analyzeStorageSlot(slotValue, block, storageDecls);

      expect(result).not.toBeNull();
      expect(result!.variableName).toBe("balances");
      expect(result!.pointer).toMatchObject({
        location: "storage",
      });
      expect(result!.chain).toBeDefined();
      expect(result!.chain!.steps).toHaveLength(1);
    });

    it("should return null for unknown storage slot", () => {
      const storageDecls: Ast.Declaration.Storage[] = [];

      const block = createBlockWithInstructions([]);
      const slotValue = constValue(99);

      const result = analyzeStorageSlot(slotValue, block, storageDecls);

      expect(result).toBeNull();
    });

    it("should return null if chain cannot be analyzed", () => {
      const storageDecls: Ast.Declaration.Storage[] = [
        {
          kind: "declaration:storage",
          id: "balances_decl",
          name: "balances",
          slot: 0,
          type: {} as Ast.Type,
          loc: null,
        },
      ];

      const block = createBlockWithInstructions([]);
      const slotValue = tempValue("nonexistent");

      const result = analyzeStorageSlot(slotValue, block, storageDecls);

      expect(result).toBeNull();
    });
  });

  describe("translateComputeSlotChain (integration)", () => {
    it("should generate pointer for simple mapping", () => {
      // balances[0x1234]
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(0), constValue(0x1234)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be: keccak256(wordsized(0x1234), 0)
      expect(pointer).toEqual({
        $keccak256: [{ $wordsized: 0x1234 }, 0],
      });
    });

    it("should generate pointer for nested mapping", () => {
      // allowances[0xaaaa][0xbbbb]
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(1), constValue(0xaaaa)),
        createMappingSlot("t2", tempValue("t1"), constValue(0xbbbb)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t2");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be: keccak256(wordsized(0xbbbb), keccak256(wordsized(0xaaaa), 1))
      expect(pointer).toEqual({
        $keccak256: [
          { $wordsized: 0xbbbb },
          {
            $keccak256: [{ $wordsized: 0xaaaa }, 1],
          },
        ],
      });
    });

    it("should generate pointer for array base", () => {
      // items (dynamic array base)
      const instructions: Ir.Instruction[] = [
        createArraySlot("t1", constValue(2)),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be: keccak256(2)
      expect(pointer).toEqual({
        $keccak256: [2],
      });
    });

    it("should generate pointer for struct field", () => {
      // account.balance (field at offset 32 = slot offset 1)
      const instructions: Ir.Instruction[] = [
        createFieldSlot("t1", constValue(3), 32),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be: sum(3, 1)
      expect(pointer).toEqual({
        $sum: [3, 1],
      });
    });

    it("should generate pointer for complex nested access", () => {
      // accounts[0xuser].balance (offset 64 = slot offset 2)
      const instructions: Ir.Instruction[] = [
        createMappingSlot("t1", constValue(4), constValue(0xaaaa)),
        createFieldSlot("t2", tempValue("t1"), 64),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t2");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be: sum(keccak256(wordsized(0xaaaa), 4), 2)
      expect(pointer).toEqual({
        $sum: [
          {
            $keccak256: [{ $wordsized: 0xaaaa }, 4],
          },
          2,
        ],
      });
    });

    it("should handle field offset of 0", () => {
      // First field - no offset needed
      const instructions: Ir.Instruction[] = [
        createFieldSlot("t1", constValue(5), 0),
      ];

      const block = createBlockWithInstructions(instructions);
      const chain = findComputeSlotChain(block, "t1");

      expect(chain).not.toBeNull();

      const pointer = translateComputeSlotChain(chain!);

      // Should be just the base slot (no sum)
      expect(pointer).toBe(5);
    });

    it("should return 0 for chain with null baseSlot", () => {
      const chain: ComputeSlotChain = {
        baseSlot: null,
        baseVariableName: null,
        steps: [],
      };

      const pointer = translateComputeSlotChain(chain);

      expect(pointer).toBe(0);
    });
  });
});
