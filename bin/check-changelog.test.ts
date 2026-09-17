import { describe, expect, it } from "vitest";
import {
  changelogMessage,
  formatProblemsMessage,
  impactLineProblems,
  missingPackageChangelogs,
  needsChangelog,
  sectionProblems,
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

describe("impactLineProblems", () => {
  const entry = (producers: string, consumers: string): string =>
    [
      "## Unreleased",
      "",
      "### Changed",
      "",
      "- A summary of the change ([#1]).",
      "  - Schemas: **ethdebug/format/pointer**",
      `  - Producers: ${producers}`,
      `  - Consumers: ${consumers}`,
      "",
    ].join("\n");

  it("accepts the no change needed. prefix", () => {
    expect(
      impactLineProblems(
        entry("no change needed.", "no change needed. One short reason."),
      ),
    ).toEqual([]);
  });

  it("accepts the optional: prefix", () => {
    expect(
      impactLineProblems(
        entry("optional: a producer may emit it.", "optional: may read it."),
      ),
    ).toEqual([]);
  });

  it("accepts the required: prefix", () => {
    expect(
      impactLineProblems(
        entry("required: `minimum` forbids it.", "required: must read it."),
      ),
    ).toEqual([]);
  });

  it("accepts a prefix on the line below a bare label", () => {
    const text = [
      "- A summary.",
      "  - Producers:",
      "    optional: a producer may emit it.",
      "",
    ].join("\n");
    expect(impactLineProblems(text)).toEqual([]);
  });

  it("reports a bare imperative with its line number", () => {
    const problems = impactLineProblems(
      entry("emit the new field.", "no change needed."),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("line 7:");
    expect(problems[0]).toContain('"Producers:"');
    expect(problems[0]).toContain('"no change needed."');
    expect(problems[0]).toContain('"optional:"');
    expect(problems[0]).toContain('"required:"');
  });

  it("reports each offending sub-item", () => {
    const problems = impactLineProblems(
      entry("emit the new field.", "Required: read the new field."),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("line 7:");
    expect(problems[1]).toContain("line 8:");
    expect(problems[1]).toContain('"Consumers:"');
  });

  it("reports a prefix that runs into the text after it", () => {
    expect(
      impactLineProblems(entry("optional:emit it.", "no change needed.")),
    ).toHaveLength(1);
  });

  it("reports a bare label with no prefix below it", () => {
    const text = ["- A summary.", "  - Consumers:", "    read it.", ""].join(
      "\n",
    );
    expect(impactLineProblems(text)).toEqual([
      expect.stringContaining("line 2:"),
    ]);
  });

  it("ignores the intro bullets that describe the sub-items", () => {
    const text = [
      "# Changelog",
      "",
      "- `Schemas:` the schema(s) the change touches.",
      "- `Producers:` what the change means for an emitter of data (a",
      "  compiler such as solc or bugc).",
      "- `Consumers:` what the change means for a reader.",
      "",
      "Each `Producers:` and `Consumers:` sub-item starts with a prefix:",
      "",
      "- `no change needed.` Nothing changes.",
      "",
    ].join("\n");
    expect(impactLineProblems(text)).toEqual([]);
  });

  it("accepts a file with no entries", () => {
    expect(impactLineProblems("# Changelog\n\n## Unreleased\n")).toEqual([]);
    expect(impactLineProblems("")).toEqual([]);
  });
});

describe("formatProblemsMessage", () => {
  it("is empty when there are no problems", () => {
    expect(formatProblemsMessage([])).toBe("");
  });

  it("names the file and lists each problem", () => {
    const message = formatProblemsMessage(["line 7: first", "line 9: second"]);
    expect(message).toContain("CHANGELOG.md");
    expect(message).toContain("  line 7: first");
    expect(message).toContain("  line 9: second");
  });
});

describe("sectionProblems", () => {
  it("accepts Added and Changed sections", () => {
    const text = "## Unreleased\n\n### Added\n\n### Changed\n";
    expect(sectionProblems(text)).toEqual([]);
  });

  it("rejects any other section with its line number", () => {
    const text = "## Unreleased\n\n### Breaking\n";
    const problems = sectionProblems(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("line 3");
    expect(problems[0]).toContain('"### Added"');
    expect(problems[0]).toContain('"### Changed"');
  });

  it("ignores version headings and deeper headings", () => {
    expect(sectionProblems("# Changelog\n\n## 0.1.0-1\n")).toEqual([]);
    expect(sectionProblems("#### Breaking\n")).toEqual([]);
  });
});
