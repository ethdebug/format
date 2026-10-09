import { describe, it, expect } from "vitest";

import { Type } from "#types";

import { computeStructLayout } from "./layout.js";

const uint = (bits: number) => Type.Elementary.uint(bits);

describe("computeStructLayout", () => {
  it("gives a struct member all its slots, as Solidity does", () => {
    const fields = new Map<string, Type>([
      ["a", uint(256)],
      ["b", uint(8)],
    ]);
    const inner = Type.struct("Inner", fields, computeStructLayout(fields));
    const layout = computeStructLayout(
      new Map<string, Type>([
        ["x", uint(8)],
        ["inner", inner],
        ["y", uint(16)],
      ]),
    );

    // x in slot 0; inner in slots 1 and 2; y in slot 3
    expect(Object.fromEntries(layout)).toEqual({
      x: { byteOffset: 0, size: 1 },
      inner: { byteOffset: 32, size: 64 },
      y: { byteOffset: 96, size: 2 },
    });
  });
});
