import { describe, expect, test } from "vitest";
import { parse } from "#parser";
import * as TypeChecker from "#typechecker";
import { generateModule } from "./generator.js";
import { Severity } from "#result";
import "#test/matchers";

describe("IR slice generation", () => {
  test("generates slice IR for msg.data", () => {
    const result = parse(`
      name Test;
      code {
        let slice = msg.data[0:4];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = TypeChecker.checkProgram(result.value);
    expect(typeResult.success).toBe(true);

    if (typeResult.success) {
      const irResult = generateModule(result.value, typeResult.value.types);
      expect(irResult.success).toBe(true);

      if (irResult.success) {
        const ir = irResult.value;
        expect(ir.main).toBeDefined();

        // Find the decomposed slice operations
        const mainBlocks = Array.from(ir.main.blocks.values());
        const allInsts = mainBlocks.flatMap((block) => block.instructions);

        // Should have operations for: sub (length calc), add (size calc),
        // allocate, write (length), add (dest offset), copy (data)
        const subInsts = allInsts.filter(
          (inst) => inst.kind === "binary" && inst.op === "sub",
        );
        const allocInsts = allInsts.filter((inst) => inst.kind === "allocate");
        const copyInsts = allInsts.filter((inst) => inst.kind === "copy");
        const writeInsts = allInsts.filter((inst) => inst.kind === "write");

        // Should have decomposed the slice into multiple operations
        expect(subInsts.length).toBeGreaterThan(0); // Length calculation
        expect(allocInsts.length).toBeGreaterThan(0); // Memory allocation(s) - may allocate for result
        expect(writeInsts.length).toBeGreaterThan(0); // Write length
        // Copy the data from calldata
        expect(copyInsts).toMatchObject([{ location: "calldata" }]);
      }
    }
  });

  test("rejects slice of non-bytes type in IR", () => {
    const result = parse(`
      name Test;
      storage {
        [0] numbers: array<uint256, 10>;
      }
      code {
        numbers[0:4];
      }
    `);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    const typeResult = TypeChecker.checkProgram(result.value);

    if (typeResult.success) {
      const irResult = generateModule(result.value, typeResult.value.types);
      expect(irResult.success).toBe(false);
      expect(irResult).toHaveMessage({
        severity: Severity.Error,
        message: "Only bytes types can be sliced",
      });
    }
  });
});
