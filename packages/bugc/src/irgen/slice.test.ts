import { describe, expect, test } from "vitest";
import { parse } from "#parser";
import * as TypeChecker from "#typechecker";
import { generateModule } from "./generator.js";
import { Severity } from "#result";
import "#test/matchers";

describe("IR slice generation", () => {
  test("generates a reference for a slice of msg.data", () => {
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

        // A slice of calldata refers to it: its word is the offset
        // shifted left 128 bits, or the length. Nothing is copied.
        const mainBlocks = Array.from(ir.main.blocks.values());
        const allInsts = mainBlocks.flatMap((block) => block.instructions);

        expect(allInsts.filter((inst) => inst.kind === "allocate")).toEqual([]);
        expect(allInsts.filter((inst) => inst.kind === "copy")).toEqual([]);
        expect(
          allInsts.filter(
            (inst) => inst.kind === "binary" && ["shl", "or"].includes(inst.op),
          ),
        ).toMatchObject([{ op: "shl", right: { value: 128n } }, { op: "or" }]);
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
