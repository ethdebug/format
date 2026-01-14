import { describe, expect, it } from "vitest";
import { parse } from "#parser";
import * as TypeChecker from "#typechecker";
import { generateModule } from "./generator.js";
import * as Ir from "#ir";
import { Result, Severity } from "#result";
import "#test/matchers";

describe("generateModule", () => {
  function buildIR(source: string): Ir.Module {
    const parseResult = parse(source);
    if (!parseResult.success) {
      throw new Error(
        `Parse error: ${Result.firstError(parseResult)?.message || "Unknown error"}`,
      );
    }
    const ast = parseResult.value;
    const typeCheckResult = TypeChecker.checkProgram(ast);

    if (!typeCheckResult.success) {
      throw new Error(
        "Type check failed: " +
          (Result.firstError(typeCheckResult)?.message || "Unknown error"),
      );
    }

    const buildResult = generateModule(ast, typeCheckResult.value.types);

    if (!buildResult.success) {
      throw new Error(
        "IR build failed: " +
          (Result.firstError(buildResult)?.message || "Unknown error"),
      );
    }

    return buildResult.value;
  }

  describe("basic programs", () => {
    it("should build IR for empty program", () => {
      const source = `
        name Empty;
        storage {}
        code {}
      `;

      const ir = buildIR(source);

      expect(ir.name).toBe("Empty");
      expect(ir.main.blocks.size).toBe(1);
      expect(ir.main.blocks.get("entry")).toBeDefined();
    });
  });

  describe("expressions", () => {
    it("should generate IR for arithmetic expressions", () => {
      const source = `
        name Arithmetic;
        storage {}
        code {
          let x = 5 + 3 * 2;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      // Should have: const 5, const 3, const 2, mul, add (no more "add 0" for assignment)
      expect(entry.instructions).toHaveLength(5);

      // Check constants (5 is loaded first as left operand of +)
      expect(entry.instructions[0]).toMatchObject({
        kind: "const",
        value: 5n,
      });
      expect(entry.instructions[1]).toMatchObject({
        kind: "const",
        value: 3n,
      });
      expect(entry.instructions[2]).toMatchObject({
        kind: "const",
        value: 2n,
      });

      // Check multiplication (3 * 2)
      expect(entry.instructions[3]).toMatchObject({
        kind: "binary",
        op: "mul",
      });

      // Check addition (5 + result)
      expect(entry.instructions[4]).toMatchObject({
        kind: "binary",
        op: "add",
      });

      // We no longer generate "add 0" for assignments - the result is directly used
    });

    it("should generate IR for comparison expressions", () => {
      const source = `
        name Comparison;
        storage {}
        code {
          let result = 10 > 5 && 3 <= 3;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      // Find the comparison instructions
      const gtInst = entry.instructions.find(
        (i: Ir.Instruction) => i.kind === "binary" && i.op === "gt",
      );
      const leInst = entry.instructions.find(
        (i: Ir.Instruction) => i.kind === "binary" && i.op === "le",
      );
      const andInst = entry.instructions.find(
        (i: Ir.Instruction) => i.kind === "binary" && i.op === "and",
      );

      expect(gtInst).toBeDefined();
      expect(leInst).toBeDefined();
      expect(andInst).toBeDefined();
    });
  });

  describe("control flow", () => {
    it("should generate basic blocks for if statements", () => {
      const source = `
        name IfStatement;
        storage {}
        code {
          let x = 10;
          if (x > 5) {
            x = 20;
          }
        }
      `;

      const ir = buildIR(source);

      // Should have: entry, then_1, merge_2
      expect(ir.main.blocks.size).toBe(3);
      expect(Array.from(ir.main.blocks.keys())).toContain("entry");
      expect(Array.from(ir.main.blocks.keys())).toContain("then_1");
      expect(Array.from(ir.main.blocks.keys())).toContain("merge_2");

      // Check branch in entry block
      const entry = ir.main.blocks.get("entry")!;
      expect(entry.terminator).toMatchObject({
        kind: "branch",
        trueTarget: "then_1",
        falseTarget: "merge_2",
      });
    });

    it("should generate basic blocks for if-else statements", () => {
      const source = `
        name IfElse;
        storage {}
        code {
          let x = 10;
          if (x > 5) {
            x = 20;
          } else {
            x = 30;
          }
        }
      `;

      const ir = buildIR(source);

      // Should have: entry, then, else, merge blocks
      expect(ir.main.blocks.size).toBe(4);
      const blockIds = Array.from(ir.main.blocks.keys());
      expect(blockIds).toContain("entry");
      expect(blockIds.some((id) => id.startsWith("then_"))).toBe(true);
      expect(blockIds.some((id) => id.startsWith("else_"))).toBe(true);
      expect(blockIds.some((id) => id.startsWith("merge_"))).toBe(true);
    });

    it("should generate basic blocks for for loops", () => {
      const source = `
        name ForLoop;
        storage {}
        code {
          for (let i = 0; i < 10; i = i + 1) {
          }
        }
      `;

      const ir = buildIR(source);

      // Should have: entry, for_header, for_body, for_update, for_exit
      expect(ir.main.blocks.size).toBeGreaterThanOrEqual(4);
      const blockIds = Array.from(ir.main.blocks.keys());
      expect(blockIds.some((id) => id.includes("for_header"))).toBe(true);
      expect(blockIds.some((id) => id.includes("for_body"))).toBe(true);
      expect(blockIds.some((id) => id.includes("for_exit"))).toBe(true);
    });

    it("should handle break in loops", () => {
      const source = `
        name BreakLoop;
        storage {}
        code {
          for (let i = 0; i < 100; i = i + 1) {
            if (i >= 10) {
              break;
            }
          }
        }
      `;

      const ir = buildIR(source);

      // Find blocks with break jumps
      let hasBreakJump = false;

      for (const block of ir.main.blocks.values()) {
        if (block.terminator.kind === "jump") {
          if (block.terminator.target.includes("for_exit")) {
            hasBreakJump = true;
          }
        }
      }

      expect(hasBreakJump).toBe(true);
    });

    it("should handle return statements", () => {
      const source = `
        name Return;
        storage {}
        code {
          if (true) {
            return;
          }
          let x = 10;
        }
      `;

      const ir = buildIR(source);

      // Find the then block
      const thenBlock = Array.from(ir.main.blocks.values()).find((b) =>
        b.id.startsWith("then_"),
      );

      expect(thenBlock).toBeDefined();
      expect(thenBlock!.terminator).toMatchObject({
        kind: "return",
      });
    });
  });

  describe("storage access", () => {
    it("should generate load_storage for reading storage", () => {
      const source = `
        name LoadStorage;
        storage {
          [0] value: uint256;
        }
        code {
          let x = value;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      const loadInst = entry.instructions.find(
        (i) => i.kind === "read" && i.location === "storage",
      );
      expect(loadInst).toMatchObject({
        kind: "read",
        location: "storage",
        slot: {
          kind: "const",
          value: 0n,
          type: Ir.Type.Scalar.uint256,
        },
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
        dest: expect.stringMatching(/^t\d+$/),
      });
    });

    it("should generate store_storage for writing storage", () => {
      const source = `
        name StoreStorage;
        storage {
          [0] value: uint256;
        }
        code {
          value = 42;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      const storeInst = entry.instructions.find(
        (i) => i.kind === "write" && i.location === "storage",
      );
      expect(storeInst).toMatchObject({
        kind: "write",
        location: "storage",
        slot: {
          kind: "const",
          value: 0n,
          type: Ir.Type.Scalar.uint256,
        },
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
      });
    });
  });

  describe("special expressions", () => {
    it("should generate env instructions for msg properties", () => {
      const source = `
        name MsgProperties;
        storage {}
        code {
          let sender = msg.sender;
          let value = msg.value;
          let data = msg.data;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      const senderInst = entry.instructions.find(
        (i) => i.kind === "env" && i.op === "msg_sender",
      );
      const valueInst = entry.instructions.find(
        (i) => i.kind === "env" && i.op === "msg_value",
      );
      const dataInst = entry.instructions.find(
        (i) => i.kind === "env" && i.op === "msg_data",
      );

      expect(senderInst).toBeDefined();
      expect(valueInst).toBeDefined();
      expect(dataInst).toBeDefined();
    });

    it("should generate env instructions for block properties", () => {
      const source = `
        name BlockProperties;
        storage {}
        code {
          let num = block.number;
          let time = block.timestamp;
        }
      `;

      const ir = buildIR(source);
      const entry = ir.main.blocks.get("entry")!;

      const numberInst = entry.instructions.find(
        (i) => i.kind === "env" && i.op === "block_number",
      );
      const timestampInst = entry.instructions.find(
        (i) => i.kind === "env" && i.op === "block_timestamp",
      );

      expect(numberInst).toBeDefined();
      expect(timestampInst).toBeDefined();
    });
  });

  describe("complex programs", () => {
    it("should build IR for counter example", () => {
      const source = `
        name Counter;
        storage {
          [0] count: uint256;
          [1] owner: address;
        }
        code {
          if (msg.sender != owner) {
            return;
          }
          count = count + 1;
        }
      `;

      const ir = buildIR(source);

      // Should have multiple basic blocks
      expect(ir.main.blocks.size).toBeGreaterThan(1);

      // Should have env instruction for msg.sender
      let hasMsgSender = false;
      for (const block of ir.main.blocks.values()) {
        if (
          block.instructions.some(
            (i) => i.kind === "env" && i.op === "msg_sender",
          )
        ) {
          hasMsgSender = true;
          break;
        }
      }
      expect(hasMsgSender).toBe(true);

      // Should have storage operations
      let hasStorageOps = false;
      for (const block of ir.main.blocks.values()) {
        if (
          block.instructions.some(
            (i) =>
              (i.kind === "read" && i.location === "storage") ||
              (i.kind === "write" && i.location === "storage"),
          )
        ) {
          hasStorageOps = true;
          break;
        }
      }
      expect(hasStorageOps).toBe(true);
    });
  });

  describe("Complex storage access patterns", () => {
    it("should handle nested mapping access with warnings", () => {
      const source = `
        name NestedMappings;

        storage {
          [0] allowances: mapping<address, mapping<address, uint256>>;
        }

        code {
          allowances[msg.sender][0x1234567890123456789012345678901234567890] = 1000;
          let amount = allowances[msg.sender][0x1234567890123456789012345678901234567890];
        }
      `;

      // Build IR using custom function that collects diagnostics
      const parseResult = parse(source);
      if (!parseResult.success) {
        throw new Error(
          `Parse error: ${Result.firstError(parseResult)?.message || "Unknown error"}`,
        );
      }
      const ast = parseResult.value;
      const typeCheckResult = TypeChecker.checkProgram(ast);

      expect(typeCheckResult.success).toBe(true);
      if (!typeCheckResult.success) return;

      const buildResult = generateModule(ast, typeCheckResult.value.types);

      expect(buildResult.success).toBe(true);
      if (!buildResult.success) return;

      const ir = buildResult.value;
      const warnings = Result.findMessages(buildResult, {
        severity: Severity.Warning,
      }).filter((d) => d.severity === "warning");

      // Should no longer have warnings about simplified IR
      expect(warnings.length).toBe(0);

      // Should generate compute_slot and read/write storage with dynamic slots
      let hasComputeSlot = false;
      let hasReadStorageDynamic = false;
      let hasWriteStorageDynamic = false;
      for (const block of ir.main.blocks.values()) {
        for (const inst of block.instructions) {
          if (inst.kind === "compute_slot") hasComputeSlot = true;
          if (
            inst.kind === "read" &&
            inst.location === "storage" &&
            inst.slot &&
            inst.slot.kind !== "const"
          )
            hasReadStorageDynamic = true;
          if (
            inst.kind === "write" &&
            inst.location === "storage" &&
            inst.slot &&
            inst.slot.kind !== "const"
          )
            hasWriteStorageDynamic = true;
        }
      }
      expect(hasComputeSlot).toBe(true);
      expect(hasReadStorageDynamic).toBe(true);
      expect(hasWriteStorageDynamic).toBe(true);
    });

    it("should handle struct field access in mappings", () => {
      const source = `
        name StructInMapping;

        define {
          struct Account {
            balance: uint256;
            nonce: uint256;
          };
        }

        storage {
          [0] accounts: mapping<address, Account>;
        }

        code {
          accounts[msg.sender].balance = 100;
          accounts[msg.sender].nonce = accounts[msg.sender].nonce + 1;
          let bal = accounts[msg.sender].balance;
        }
      `;

      const ir = buildIR(source);

      // Should generate compute_slot for both mapping and field operations
      let hasMappingSlot = false;
      let hasFieldSlot = false;
      let hasReadStorageDynamic = false;
      let hasWriteStorageDynamic = false;

      for (const block of ir.main.blocks.values()) {
        for (const inst of block.instructions) {
          if (inst.kind === "compute_slot") {
            if (inst.slotKind === "mapping") hasMappingSlot = true;
            if (inst.slotKind === "field") hasFieldSlot = true;
          }
          if (
            inst.kind === "read" &&
            inst.location === "storage" &&
            inst.slot &&
            inst.slot.kind !== "const"
          )
            hasReadStorageDynamic = true;
          if (
            inst.kind === "write" &&
            inst.location === "storage" &&
            inst.slot &&
            inst.slot.kind !== "const"
          )
            hasWriteStorageDynamic = true;
        }
      }

      expect(hasMappingSlot).toBe(true);
      expect(hasFieldSlot).toBe(true);
      expect(hasReadStorageDynamic).toBe(true);
      expect(hasWriteStorageDynamic).toBe(true);
    });

    it("should handle triple nested mappings", () => {
      const source = `
        name ComplexPatterns;

        storage {
          [0] data: mapping<address, mapping<uint256, mapping<uint256, uint256>>>;
        }

        code {
          // Triple nested mapping
          data[msg.sender][1][2] = 42;
        }
      `;

      const parseResult = parse(source);
      if (!parseResult.success) {
        throw new Error(
          `Parse error: ${Result.firstError(parseResult)?.message || "Unknown error"}`,
        );
      }
      const ast = parseResult.value;
      const typeCheckResult = TypeChecker.checkProgram(ast);

      expect(typeCheckResult.success).toBe(true);
      if (!typeCheckResult.success) return;

      const buildResult = generateModule(ast, typeCheckResult.value.types);

      expect(buildResult.success).toBe(true);
      if (!buildResult.success) return;

      // Verify that IR is generated for triple nested mappings
      let instructionCount = 0;
      let computeSlotCount = 0;

      for (const block of buildResult.value.main.blocks.values()) {
        instructionCount += block.instructions.length;
        for (const inst of block.instructions) {
          if (inst.kind === "compute_slot") {
            computeSlotCount++;
          }
        }
      }

      // Should generate instructions including 3 compute_slot operations
      expect(instructionCount).toBeGreaterThan(0);
      expect(computeSlotCount).toBe(3);
    });

    it("should handle array element access in mappings", () => {
      const source = `
        name ArrayInMapping;

        storage {
          [0] counts: mapping<uint256, array<uint256, 5>>;
        }

        code {
          // Array element access in mapping - currently generates
          // load_mapping followed by load_index/store_index
          // but doesn't store array back (incorrect!)
          counts[2][3] = 42;
          let count = counts[2][3];
        }
      `;

      // With our storage chain detection, it should emit warnings
      const parseResult = parse(source);
      if (!parseResult.success) {
        throw new Error(
          `Parse error: ${Result.firstError(parseResult)?.message || "Unknown error"}`,
        );
      }
      const ast = parseResult.value;
      const typeCheckResult = TypeChecker.checkProgram(ast);
      expect(typeCheckResult.success).toBe(true);
      if (!typeCheckResult.success) return;

      const buildResult = generateModule(ast, typeCheckResult.value.types);
      expect(buildResult.success).toBe(true);
      if (!buildResult.success) return;

      const warnings = Result.findMessages(buildResult, {
        severity: Severity.Warning,
      }).filter((d) => d.severity === "warning");

      // Should no longer have warnings
      expect(warnings.length).toBe(0);

      // Check that the proper instructions are generated
      let hasMappingSlot = false;
      let hasArraySlot = false;
      let hasBinaryAdd = false;
      let hasStorageDynamic = false;

      for (const block of buildResult.value.main.blocks.values()) {
        for (const inst of block.instructions) {
          if (inst.kind === "compute_slot") {
            if (inst.slotKind === "mapping") hasMappingSlot = true;
            if (inst.slotKind === "array") hasArraySlot = true;
          }
          if (inst.kind === "binary" && inst.op === "add") hasBinaryAdd = true;
          if (
            ((inst.kind === "read" && inst.location === "storage") ||
              (inst.kind === "write" && inst.location === "storage")) &&
            inst.slot &&
            inst.slot.kind !== "const"
          ) {
            hasStorageDynamic = true;
          }
        }
      }

      expect(hasMappingSlot).toBe(true);
      // Both fixed and dynamic arrays now use compute_slot with kind="array" for proper storage layout
      expect(hasArraySlot).toBe(true);
      // We now generate "add" instructions to compute array element slots
      expect(hasBinaryAdd).toBe(true);
      expect(hasStorageDynamic).toBe(true);
    });
  });
});
