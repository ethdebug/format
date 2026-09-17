import { describe, expect, it } from "vitest";
import { checkPackList, parsePackOutput } from "./packlist.js";

describe("checkPackList", () => {
  it("accepts the allowed shape", () => {
    expect(
      checkPackList([
        "package.json",
        "README.md",
        "LICENSE",
        "CHANGELOG.md",
        "dist/src/index.js",
        "dist/src/a/b.d.ts",
        "dist/bin/bugc.js",
      ]),
    ).toEqual([]);
  });

  it("rejects src, tests, buildinfo, and dist/test", () => {
    expect(
      checkPackList([
        "src/index.ts",
        "dist/src/x.test.js",
        "dist/tsconfig.build.tsbuildinfo",
        "dist/test/helper.js",
        "dist/vitest.config.js",
      ]),
    ).toEqual([
      "src/index.ts",
      "dist/src/x.test.js",
      "dist/tsconfig.build.tsbuildinfo",
      "dist/test/helper.js",
      "dist/vitest.config.js",
    ]);
  });
});

describe("parsePackOutput", () => {
  it("takes the last JSON array after script noise", () => {
    const out = [
      "yarn run v1.22.22",
      "$ node ./bin/generate-schema-yamls.js",
      "Done in 0.46s.",
      "[",
      '  { "files": [ { "path": "dist/src/index.js" } ] }',
      "]",
    ].join("\n");
    expect(parsePackOutput(out)).toEqual(["dist/src/index.js"]);
  });
});
