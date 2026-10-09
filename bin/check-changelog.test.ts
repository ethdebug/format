import { describe, expect, it } from "vitest";
import {
  changelogMessage,
  missingPackageChangelogs,
  needsChangelog,
} from "./check-changelog.js";

const packagePrefixes = ["packages/format", "packages/pointers"];

describe("needsChangelog", () => {
  it("is false when nothing relevant changed", () => {
    expect(needsChangelog(["README.md"])).toBe(false);
  });

  describe("schemas rule", () => {
    it("is false when no schema files changed", () => {
      expect(needsChangelog(["packages/pointers/src/read.ts"])).toBe(false);
    });

    it("is false when schemas changed alongside CHANGELOG.md", () => {
      expect(
        needsChangelog(["schemas/pointer.schema.yaml", "CHANGELOG.md"]),
      ).toBe(false);
    });

    it("is true when schemas changed without CHANGELOG.md", () => {
      expect(needsChangelog(["schemas/pointer.schema.yaml"])).toBe(true);
    });

    it("ignores paths that merely contain the word schemas", () => {
      expect(needsChangelog(["packages/format/schemas-notes.md"])).toBe(false);
    });
  });

  describe("per-package rule", () => {
    it("is false when a package's src/ changed with its CHANGELOG.md", () => {
      expect(
        needsChangelog(
          ["packages/pointers/src/read.ts", "packages/pointers/CHANGELOG.md"],
          packagePrefixes,
        ),
      ).toBe(false);
    });

    it("is true when a package's src/ changed without its CHANGELOG.md", () => {
      expect(
        needsChangelog(["packages/pointers/src/read.ts"], packagePrefixes),
      ).toBe(true);
    });

    it("is true when a package's bin/ changed without its CHANGELOG.md", () => {
      expect(
        needsChangelog(["packages/pointers/bin/cli.ts"], packagePrefixes),
      ).toBe(true);
    });

    it("is true when a package.json changed without its CHANGELOG.md", () => {
      expect(
        needsChangelog(["packages/pointers/package.json"], packagePrefixes),
      ).toBe(true);
    });

    it("ignores a colocated test file under src/", () => {
      expect(
        needsChangelog(["packages/pointers/src/read.test.ts"], packagePrefixes),
      ).toBe(false);
    });

    it("ignores a colocated .tsx test file", () => {
      expect(
        needsChangelog(
          ["packages/pointers-react/src/cursor.test.tsx"],
          ["packages/pointers-react"],
        ),
      ).toBe(false);
    });

    it("ignores an examples test suite", () => {
      expect(
        needsChangelog(
          ["packages/pointers/src/pointer.examples.test.ts"],
          packagePrefixes,
        ),
      ).toBe(false);
    });

    it("is true when a test file accompanies a source change", () => {
      expect(
        needsChangelog(
          [
            "packages/pointers/src/read.ts",
            "packages/pointers/src/read.test.ts",
          ],
          packagePrefixes,
        ),
      ).toBe(true);
    });

    it("is false for a package not in the public list", () => {
      expect(
        needsChangelog(["packages/conformance/src/index.ts"], packagePrefixes),
      ).toBe(false);
    });

    it("is false for files outside src/, bin/, and package.json", () => {
      expect(
        needsChangelog(["packages/pointers/README.md"], packagePrefixes),
      ).toBe(false);
    });
  });

  describe("both rules at once", () => {
    it("is true when schemas and a package both need entries", () => {
      expect(
        needsChangelog(
          ["schemas/pointer.schema.yaml", "packages/pointers/src/read.ts"],
          packagePrefixes,
        ),
      ).toBe(true);
    });

    it("is false when both changelogs are present", () => {
      expect(
        needsChangelog(
          [
            "schemas/pointer.schema.yaml",
            "packages/pointers/src/read.ts",
            "CHANGELOG.md",
            "packages/pointers/CHANGELOG.md",
          ],
          packagePrefixes,
        ),
      ).toBe(false);
    });
  });
});

describe("missingPackageChangelogs", () => {
  it("lists only the packages that were touched", () => {
    expect(
      missingPackageChangelogs(
        ["packages/pointers/src/read.ts"],
        packagePrefixes,
      ),
    ).toEqual(["packages/pointers/CHANGELOG.md"]);
  });

  it("lists every touched package that is missing its file", () => {
    expect(
      missingPackageChangelogs(
        ["packages/pointers/src/read.ts", "packages/format/package.json"],
        packagePrefixes,
      ),
    ).toEqual([
      "packages/format/CHANGELOG.md",
      "packages/pointers/CHANGELOG.md",
    ]);
  });

  it("omits a package whose CHANGELOG.md is already in the diff", () => {
    expect(
      missingPackageChangelogs(
        ["packages/pointers/src/read.ts", "packages/pointers/CHANGELOG.md"],
        packagePrefixes,
      ),
    ).toEqual([]);
  });
});

describe("changelogMessage", () => {
  it("lists only the changed schema paths", () => {
    const message = changelogMessage([
      "schemas/pointer.schema.yaml",
      "schemas/pointer/expression.schema.yaml",
      "packages/pointers/src/read.ts",
    ]);
    expect(message).toContain("schemas/pointer.schema.yaml");
    expect(message).toContain("schemas/pointer/expression.schema.yaml");
    expect(message).not.toContain("packages/pointers/src/read.ts");
  });

  it("points at the Unreleased section and the skip label", () => {
    const message = changelogMessage(["schemas/pointer.schema.yaml"]);
    expect(message).toContain("## Unreleased");
    expect(message).toContain("changelog: skip");
  });

  it("names the skip label for a package-only failure", () => {
    const message = changelogMessage(
      ["packages/pointers/src/read.ts"],
      packagePrefixes,
    );
    expect(message).toContain("changelog: skip");
  });

  it("names the skip label once when both rules apply", () => {
    const message = changelogMessage(
      ["schemas/pointer.schema.yaml", "packages/pointers/src/read.ts"],
      packagePrefixes,
    );
    expect(message.match(/changelog: skip/g)).toHaveLength(1);
  });

  it("mentions the skip label last", () => {
    const message = changelogMessage(["schemas/pointer.schema.yaml"]);
    expect(message.trimEnd().split("\n").at(-1)).toContain("changelog: skip");
  });

  it("is empty when nothing is missing", () => {
    expect(changelogMessage(["README.md"], packagePrefixes)).toBe("");
  });

  it("names each missing package CHANGELOG.md", () => {
    const message = changelogMessage(
      ["packages/pointers/src/read.ts", "packages/format/package.json"],
      packagePrefixes,
    );
    expect(message).toContain("packages/pointers/CHANGELOG.md");
    expect(message).toContain("packages/format/CHANGELOG.md");
  });

  it("combines the schemas and package sections when both apply", () => {
    const message = changelogMessage(
      ["schemas/pointer.schema.yaml", "packages/pointers/src/read.ts"],
      packagePrefixes,
    );
    expect(message).toContain("schemas/pointer.schema.yaml");
    expect(message).toContain("packages/pointers/CHANGELOG.md");
  });
});
