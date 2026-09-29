import { describe, expect, it } from "vitest";

import { parseArgs } from "./version.js";

describe("parseArgs", () => {
  it("defaults to prerelease", () => {
    expect(parseArgs([])).toEqual({
      keyword: "prerelease",
      all: false,
      dryRun: false,
    });
  });

  it("reads a keyword and the flags in any order", () => {
    expect(parseArgs(["--all", "preminor", "--dry-run"])).toEqual({
      keyword: "preminor",
      all: true,
      dryRun: true,
    });
  });

  it("rejects an explicit version, prepatch, and unknown options", () => {
    expect(() => parseArgs(["0.1.0-3"])).toThrow(/usage/);
    expect(() => parseArgs(["prepatch"])).toThrow(/usage/);
    expect(() => parseArgs(["--force"])).toThrow(/unknown option/);
    expect(() => parseArgs(["patch", "minor"])).toThrow(/usage/);
  });

  it("rejects an empty positional", () => {
    expect(() => parseArgs([""])).toThrow(/usage/);
    expect(() => parseArgs(["", "--dry-run"])).toThrow(/usage/);
  });
});
