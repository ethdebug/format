import { describe, it, expect } from "vitest";
import { parse } from "#parser";
import * as TypeChecker from "#typechecker";
import * as Irgen from "#irgen";
import type * as Ir from "#ir";

import { Layout, Liveness, Memory } from "#evmgen/analysis";
import { Module, Function } from "#evmgen/generation";

describe("Constructor array storage", () => {
  it("should correctly store values in fixed-size arrays during construction", () => {
    const source = `name ConstructorArray;

storage {
  [0] items: array<uint256, 3>;
}

create {
  items[0] = 1005;
  items[1] = 1006;
  items[2] = 1007;
}

code {}
`;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      // Parse error details available in parseResult
    }
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const typeCheckResult = TypeChecker.checkProgram(parseResult.value);
    expect(typeCheckResult.success).toBe(true);
    if (!typeCheckResult.success) return;

    // Generate IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeCheckResult.value.types,
    );
    expect(irResult.success).toBe(true);
    if (!irResult.success) return;

    const module = irResult.value;
    expect(module.create).toBeDefined();

    // Check IR - should have compute_slot for array access
    const createFunc = module.create!;
    const entry = createFunc.blocks.get("entry")!;

    // Check that we have compute_slot instructions for array access
    const computeSlotInstructions = entry.instructions.filter(
      (i) => i.kind === "compute_slot" && i.slotKind === "array",
    );
    expect(computeSlotInstructions.length).toBe(3);

    // Instructions are verified by checking write instructions below

    // Check write instructions (new unified format for storage writes)
    const storeInstructions = entry.instructions.filter(
      (i) => i.kind === "write" && i.location === "storage",
    );
    expect(storeInstructions.length).toBe(3);

    // Generate bytecode
    const liveness = Liveness.Function.analyze(createFunc);
    const memoryResult = Memory.Function.plan(createFunc, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;
    const layoutResult = Layout.Function.perform(createFunc);
    if (!layoutResult.success) throw new Error("Block layout failed");
    const layout = layoutResult.value;

    const { instructions } = Function.generate(createFunc, memory, layout);

    // Check instructions contain SSTORE operations
    const sstoreInstructions = instructions.filter(
      (inst) => inst.mnemonic === "SSTORE",
    );
    expect(sstoreInstructions.length).toBe(3);

    // Should have exactly 3 SSTORE operations
    expect(sstoreInstructions).toHaveLength(3);
  });

  it("should generate correct deployment bytecode for array constructor", () => {
    const source = `name ConstructorArray;

storage {
  [0] items: array<uint256, 3>;
}

create {
  items[0] = 1005;
  items[1] = 1006;
  items[2] = 1007;
}

code {}
`;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      // Parse error details available in parseResult
    }
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const typeCheckResult = TypeChecker.checkProgram(parseResult.value);
    expect(typeCheckResult.success).toBe(true);
    if (!typeCheckResult.success) return;

    // Generate IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeCheckResult.value.types,
    );
    expect(irResult.success).toBe(true);
    if (!irResult.success) return;

    // Generate full module bytecode
    const module = irResult.value;

    const liveness = Liveness.Module.analyze(module);
    const memoryResult = Memory.Module.plan(module, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");

    const blockResult = Layout.Module.perform(module);
    if (!blockResult.success) throw new Error("Block layout failed");

    const result = Module.generate(
      module,
      memoryResult.value,
      blockResult.value,
    );

    expect(result.create).toBeDefined();
    expect(result.runtime).toBeDefined();
    expect(result.createInstructions).toBeDefined();

    // Should have 3 SSTORE instructions in the constructor
    const sstoreInstructions = result.createInstructions!.filter(
      (inst) => inst.mnemonic === "SSTORE",
    );
    expect(sstoreInstructions).toHaveLength(3);

    // Should have deployment wrapper instructions
    expect(
      result.createInstructions!.some((inst) => inst.mnemonic === "CODECOPY"),
    ).toBe(true);
    expect(
      result.createInstructions!.some((inst) => inst.mnemonic === "RETURN"),
    ).toBe(true);
  });

  it("should not allocate memory for intermediate slot calculations", () => {
    const source = `name ConstructorArray;

storage {
  [0] items: array<uint256, 3>;
}

create {
  items[0] = 1005;
  items[1] = 1006;
  items[2] = 1007;
}

code {}
`;

    // Parse and type check
    const parseResult = parse(source);
    if (!parseResult.success) {
      // Parse error details available in parseResult
    }
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const typeCheckResult = TypeChecker.checkProgram(parseResult.value);
    expect(typeCheckResult.success).toBe(true);
    if (!typeCheckResult.success) return;

    // Generate IR
    const irResult = Irgen.generateModule(
      parseResult.value,
      typeCheckResult.value.types,
    );
    expect(irResult.success).toBe(true);
    if (!irResult.success) return;

    const module = irResult.value;
    const createFunc = module.create!;

    // Analyze what gets allocated to memory
    const liveness = Liveness.Function.analyze(createFunc);
    const memoryResult = Memory.Function.plan(createFunc, liveness);
    if (!memoryResult.success) throw new Error("Memory planning failed");
    const memory = memoryResult.value;

    // The slot calculation results (t2, t5, t8) should NOT be in memory
    // because they're only used once immediately after creation
    const entry = createFunc.blocks.get("entry")!;

    // Find the add instruction destinations (these are the computed slots)
    const slotTemps = entry.instructions
      .filter((i) => i.kind === "binary" && i.op === "add")
      .map((i) => (i as Ir.Instruction & { kind: "binary" }).dest);

    // These should NOT be allocated to memory if they're only used once
    for (const temp of slotTemps) {
      expect(temp in memory.allocations).toBe(false);
    }
  });
});
