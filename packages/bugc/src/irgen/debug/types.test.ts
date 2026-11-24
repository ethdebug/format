import { describe, it, expect } from "vitest";

import { Type as BugType } from "#types";

import { convertBugType } from "./types.js";

describe("convertBugType", () => {
  it("emits an unsigned number for uint", () => {
    expect(convertBugType(BugType.Elementary.uint(256))).toEqual({
      kind: "number",
      label: "uint256",
    });
  });

  it("emits a signed number for int", () => {
    expect(convertBugType(BugType.Elementary.int(8))).toEqual({
      kind: "number",
      signed: true,
      label: "int8",
    });
  });

  it("labels a dynamic array with its spelling", () => {
    expect(convertBugType(BugType.array(BugType.Elementary.uint(256)))).toEqual(
      {
        kind: "array",
        label: "array<uint256>",
        contains: { type: { kind: "number", label: "uint256" } },
      },
    );
  });

  it("labels a fixed-size array with its spelling", () => {
    expect(
      convertBugType(BugType.array(BugType.Elementary.uint(8), 3)),
    ).toEqual({
      kind: "array",
      label: "array<uint8, 3>",
      contains: { type: { kind: "number", label: "uint8" } },
    });
  });
});
