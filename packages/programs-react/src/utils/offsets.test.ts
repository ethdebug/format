/**
 * Tests for offset computation utility.
 */

import { describe, it, expect } from "vitest";
import { computeOffsets } from "./offsets.js";

describe("computeOffsets", () => {
  it("computes offset 0 for first instruction", () => {
    const instructions = [
      { operation: { mnemonic: "PUSH1" as const, arguments: ["0x80"] } },
    ];

    const result = computeOffsets(instructions);

    expect(result).toHaveLength(1);
    expect(result[0].offset).toBe(0);
  });

  it("computes sequential offsets based on operation size", () => {
    const instructions = [
      // PUSH1 0x80 = 2 bytes (1 opcode + 1 byte argument)
      { operation: { mnemonic: "PUSH1" as const, arguments: ["0x80"] } },
      // PUSH1 0x40 = 2 bytes
      { operation: { mnemonic: "PUSH1" as const, arguments: ["0x40"] } },
      // MSTORE = 1 byte (no arguments)
      { operation: { mnemonic: "MSTORE" as const } },
    ];

    const result = computeOffsets(instructions);

    expect(result).toHaveLength(3);
    expect(result[0].offset).toBe(0); // First instruction at 0
    expect(result[1].offset).toBe(2); // After PUSH1 0x80 (2 bytes)
    expect(result[2].offset).toBe(4); // After PUSH1 0x40 (2 bytes)
  });

  it("handles larger push operations correctly", () => {
    const instructions = [
      // PUSH32 = 33 bytes (1 opcode + 32 byte argument)
      {
        operation: {
          mnemonic: "PUSH32" as const,
          arguments: ["0x" + "ff".repeat(32)],
        },
      },
      // STOP = 1 byte
      { operation: { mnemonic: "STOP" as const } },
    ];

    const result = computeOffsets(instructions);

    expect(result).toHaveLength(2);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(33); // 1 + 32
  });

  it("handles numeric arguments", () => {
    const instructions = [
      // Using numeric argument
      { operation: { mnemonic: "PUSH1" as const, arguments: [128] } },
      { operation: { mnemonic: "STOP" as const } },
    ];

    const result = computeOffsets(instructions);

    expect(result).toHaveLength(2);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(2); // 1 opcode + 1 byte for 0x80
  });

  it("preserves original instruction properties", () => {
    const instructions = [
      {
        operation: { mnemonic: "PUSH1" as const, arguments: ["0x80"] },
        context: { remark: "test" },
      },
    ];

    const result = computeOffsets(instructions);

    expect(result[0]).toMatchObject({
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x80"] },
      context: { remark: "test" },
    });
  });

  it("returns empty array for empty input", () => {
    const result = computeOffsets([]);
    expect(result).toEqual([]);
  });
});
