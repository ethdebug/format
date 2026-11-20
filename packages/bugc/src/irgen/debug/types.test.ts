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
});
