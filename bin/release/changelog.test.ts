import { describe, expect, it } from "vitest";

import {
  changelogProblems,
  formatProblemsMessage,
  hasReleaseSection,
  hasUnreleasedEntries,
  impactLineProblems,
  sectionProblems,
} from "./changelog.js";

const cut = [
  "# Changelog",
  "",
  "## Unreleased",
  "",
  "## 0.1.0-draft.0 — 2026-09-18",
  "",
  "### Changed",
  "",
  "- Something changed ([#310]).",
  "",
  "## 0.1.0-2 — 2026-09-17",
  "",
  "No changes to the specification.",
  "",
  "[#310]: https://github.com/ethdebug/format/pull/310",
].join("\n");

describe("hasReleaseSection", () => {
  it("finds a dated section that has an entry", () => {
    expect(hasReleaseSection(cut, "0.1.0-draft.0")).toBe(true);
  });

  it("accepts a section that holds one sentence", () => {
    expect(hasReleaseSection(cut, "0.1.0-2")).toBe(true);
  });

  it("does not match a longer version with the same prefix", () => {
    expect(hasReleaseSection(cut, "0.1.0")).toBe(false);
    expect(hasReleaseSection(cut, "0.1.0-draft.0.1")).toBe(false);
  });

  it(
    "is false for a section with only sub-headings or link " + "definitions",
    () => {
      expect(
        hasReleaseSection("## 0.1.0\n\n### Changed\n\n## 0.0.1\n", "0.1.0"),
      ).toBe(false);
      expect(
        hasReleaseSection("## 0.1.0\n\n[#1]: https://example.com\n", "0.1.0"),
      ).toBe(false);
    },
  );

  it("reads CRLF line endings", () => {
    const text =
      "## Unreleased\r\n\r\n- Left.\r\n\r\n## 0.1.0\r\n\r\n- Entry.\r\n";
    expect(hasUnreleasedEntries(text)).toBe(true);
    expect(hasReleaseSection(text, "0.1.0")).toBe(true);
  });
});

describe("changelogProblems", () => {
  it("is empty for a changelog that was cut", () => {
    expect(
      changelogProblems([
        { path: "CHANGELOG.md", version: "0.1.0-draft.0", text: cut },
      ]),
    ).toEqual([]);
  });

  it("reports a missing section, leftovers, and a missing file", () => {
    const leftover = "## Unreleased\n\n- Left behind.\n";
    expect(
      changelogProblems([
        { path: "a/CHANGELOG.md", version: "0.1.0-preview.1", text: leftover },
        { path: "b/CHANGELOG.md", version: "0.1.0-preview.1", text: undefined },
      ]),
    ).toEqual([
      'a/CHANGELOG.md: no "## 0.1.0-preview.1" section with an entry',
      'a/CHANGELOG.md: entries remain under "## Unreleased"',
      "b/CHANGELOG.md: file is missing",
    ]);
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
