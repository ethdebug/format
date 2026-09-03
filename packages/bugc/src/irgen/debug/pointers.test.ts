import { describe, it, expect } from "vitest";

import { mappingAccess, arrayElementAccess } from "./pointers.js";

/**
 * `$keccak256` operands must be width-bearing bytes: the EVM hashes
 * key‖slot as two 32-byte words, so a bare integer slot operand would
 * hash the wrong number of bytes.
 */
describe("mappingAccess", () => {
  it("wordsizes a literal slot operand", () => {
    expect(mappingAccess(0, 0x1234)).toEqual({
      $keccak256: [{ $wordsized: 0x1234 }, { $wordsized: 0 }],
    });
  });

  it("wordsizes an arithmetic slot operand", () => {
    expect(mappingAccess({ $sum: [3, 1] }, 0x1234)).toEqual({
      $keccak256: [{ $wordsized: 0x1234 }, { $wordsized: { $sum: [3, 1] } }],
    });
  });

  it("does not re-wrap a nested keccak256 slot operand", () => {
    const inner = mappingAccess(1, 0xaaaa);
    expect(mappingAccess(inner, 0xbbbb)).toEqual({
      $keccak256: [{ $wordsized: 0xbbbb }, inner],
    });
  });
});

describe("arrayElementAccess", () => {
  it("wordsizes the base slot of a dynamic array", () => {
    expect(arrayElementAccess(2, "i", true)).toEqual({
      $sum: [{ $keccak256: [{ $wordsized: 2 }] }, "i"],
    });
  });

  it("does not hash the base slot of a fixed array", () => {
    expect(arrayElementAccess(2, "i", false)).toEqual({
      $sum: [2, "i"],
    });
  });
});
