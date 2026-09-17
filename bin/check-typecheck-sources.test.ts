import { describe, expect, it } from "vitest";
import { builtFiles } from "./check-typecheck-sources.js";

const listing = [
  "/repo/node_modules/typescript/lib/lib.es2020.d.ts",
  "/repo/packages/format/src/index.ts",
  "/repo/packages/pointers/src/read.ts",
  "/repo/node_modules/@types/node/index.d.ts",
  "",
];

describe("builtFiles", () => {
  it("accepts source files and third-party declarations", () => {
    expect(builtFiles(listing.join("\n"))).toEqual([]);
  });

  it("reports a sibling package's built declarations", () => {
    const stdout = [
      ...listing,
      "/repo/packages/format/dist/src/index.d.ts",
    ].join("\n");
    expect(builtFiles(stdout)).toEqual([
      "/repo/packages/format/dist/src/index.d.ts",
    ]);
  });

  it("reports declarations reached through node_modules/@ethdebug", () => {
    const stdout = [
      ...listing,
      "/repo/node_modules/@ethdebug/format/dist/src/index.d.ts",
    ].join("\n");
    expect(builtFiles(stdout)).toEqual([
      "/repo/node_modules/@ethdebug/format/dist/src/index.d.ts",
    ]);
  });
});
