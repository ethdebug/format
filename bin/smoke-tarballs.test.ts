import { describe, expect, it } from "vitest";
import { siblingTarballs } from "./smoke-tarballs.js";
import type { Workspace } from "./release/workspaces.js";

const ws = (dependencies: string[]): Workspace => ({
  name: "@ethdebug/x",
  version: "1.0.0",
  dir: "/repo/packages/x",
  private: false,
  text: "{}",
  json: {},
  runtime: dependencies,
  peer: [],
  dev: [],
  optional: [],
  dependencies,
  all: dependencies,
});

describe("siblingTarballs", () => {
  it("returns the tarball for each built @ethdebug dependency", () => {
    const built = new Map([
      ["@ethdebug/format", "/tmp/ethdebug-format-1.0.0.tgz"],
      ["@ethdebug/pointers", "/tmp/ethdebug-pointers-1.0.0.tgz"],
    ]);
    expect(
      siblingTarballs(ws(["@ethdebug/format", "@ethdebug/pointers"]), built),
    ).toEqual([
      "/tmp/ethdebug-format-1.0.0.tgz",
      "/tmp/ethdebug-pointers-1.0.0.tgz",
    ]);
  });

  it("skips a dependency with no built tarball yet", () => {
    const built = new Map([
      ["@ethdebug/format", "/tmp/ethdebug-format-1.0.0.tgz"],
    ]);
    expect(
      siblingTarballs(ws(["@ethdebug/format", "@ethdebug/missing"]), built),
    ).toEqual(["/tmp/ethdebug-format-1.0.0.tgz"]);
  });

  it("returns an empty list for a workspace with no dependencies", () => {
    expect(siblingTarballs(ws([]), new Map())).toEqual([]);
  });
});
