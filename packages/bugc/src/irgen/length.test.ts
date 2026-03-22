import { describe, expect, it } from "vitest";
import { parse } from "#parser";
import * as TypeChecker from "#typechecker";
import { generateModule } from "./generator.js";

describe("IR Builder - Length Instructions", () => {
  it("should generate const for fixed-size array length", () => {
    const source = `
      name ArrayLength;

      storage {
        [0] arr: array<uint256, 10>;
        [1] len: uint256;
      }

      code {
        len = arr.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      const main = ir.value.main;
      const entryBlock = main.blocks.get(main.entry)!;

      // For fixed-size arrays, length is a compile-time constant
      const constInst = entryBlock.instructions.find(
        (inst) => inst.kind === "const" && inst.value === 10n,
      );

      expect(constInst).toBeDefined();
      expect(constInst?.kind).toBe("const");
    }
  });

  it("should generate length instruction for msg.data", () => {
    const source = `
      name DataLength;

      storage {
        [0] dataSize: uint256;
      }

      code {
        dataSize = msg.data.length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      const main = ir.value.main;
      const entryBlock = main.blocks.get(main.entry)!;

      // Should have: msg_data, length, store_storage
      const instructions = entryBlock.instructions;

      const msgDataInst = instructions.find((inst) => inst.kind === "env");
      expect(msgDataInst).toBeDefined();

      const lengthInst = instructions.find((inst) => inst.kind === "length");
      expect(lengthInst).toBeDefined();
      expect(lengthInst?.kind).toBe("length");

      if (lengthInst && lengthInst.kind === "length") {
        expect(lengthInst.object.type?.kind).toBe("ref");
        if (lengthInst.object.type?.kind === "ref") {
          expect(lengthInst.object.type.location).toBe("memory");
        }
      }
    }
  });

  it("should generate length in conditional expressions", () => {
    const source = `
      name LengthCondition;

      storage {
        [0] isLarge: bool;
      }

      code {
        if (msg.data.length > 100) {
          isLarge = true;
        } else {
          isLarge = false;
        }
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      const main = ir.value.main;
      const entryBlock = main.blocks.get(main.entry)!;

      // Should have msg_data, length, const 100, gt comparison
      const lengthInst = entryBlock.instructions.find(
        (inst) => inst.kind === "length",
      );
      expect(lengthInst).toBeDefined();

      const compareInst = entryBlock.instructions.find(
        (inst) => inst.kind === "binary" && inst.op === "gt",
      );
      expect(compareInst).toBeDefined();
    }
  });

  it("should generate const for fixed-size array loop bounds", () => {
    const source = `
      name LengthLoop;

      storage {
        [0] arr: array<uint256, 5>;
      }

      code {
        for (let i = 0; i < arr.length; i = i + 1) {
          arr[i] = i * 2;
        }
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      const main = ir.value.main;

      // For fixed-size arrays, length should be a compile-time constant (5)
      let constInstructionFound = false;
      for (const [, block] of main.blocks) {
        const constInst = block.instructions.find(
          (inst) => inst.kind === "const" && inst.value === 5n,
        );
        if (constInst) {
          constInstructionFound = true;
          break;
        }
      }

      expect(constInstructionFound).toBe(true);
    }
  });

  it("should handle nested access with fixed-size length", () => {
    const source = `
      name NestedLength;

      storage {
        [0] matrix: array<array<uint256, 3>, 2>;
        [1] result: uint256;
      }

      code {
        result = matrix[0].length;
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      const main = ir.value.main;
      const entryBlock = main.blocks.get(main.entry)!;

      // For fixed-size inner arrays, length is a compile-time constant (3)
      // We don't need to load from storage to get the length
      const constInst = entryBlock.instructions.find(
        (inst) => inst.kind === "const" && inst.value === 3n,
      );
      expect(constInst).toBeDefined();
    }
  });

  it("should handle string length in functions", () => {
    const source = `
      name StringLength;

      define {
        function checkString(s: string) -> bool {
          return s.length > 0;
        };
      }

      code {
        let hasData = checkString("test");
      }
    `;

    const ast = parse(source);
    expect(ast.success).toBe(true);
    if (!ast.success) return;

    const checkResult = TypeChecker.checkProgram(ast.value);
    expect(checkResult.success).toBe(true);
    if (!checkResult.success) return;

    const ir = generateModule(ast.value, checkResult.value.types);
    expect(ir.success).toBe(true);

    if (ir.success) {
      // Check the function has a length instruction
      const checkStringFunc = ir.value.functions?.get("checkString");
      expect(checkStringFunc).toBeDefined();

      if (checkStringFunc) {
        let lengthFound = false;
        for (const [, block] of checkStringFunc.blocks) {
          if (block.instructions.some((inst) => inst.kind === "length")) {
            lengthFound = true;
            break;
          }
        }
        expect(lengthFound).toBe(true);
      }
    }
  });
});
