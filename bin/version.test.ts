import { describe, expect, it } from "vitest";
import {
  changelogProblems,
  expectedVersionSites,
  forcedNames,
  hasReleaseSection,
  hasUnreleasedEntries,
  identifierFor,
  keywordProblems,
  type Manifest,
  type Move,
  nextVersion,
  parseArgs,
  parseChanged,
  planMoves,
  planProblems,
  requiredChangelogs,
  rewriteManifest,
  rewriteSchemaVersions,
  undoAdvice,
} from "./version.js";

function manifest(
  name: string,
  version: string,
  dependencies: string[] = [],
  isPrivate = false,
): Manifest {
  return {
    name,
    version,
    dir: `/repo/packages/${name.replace("@ethdebug/", "")}`,
    private: isPrivate,
    dependencies,
    json: { name, version },
  };
}

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

describe("identifierFor", () => {
  it("gives draft to the spec package and preview to the rest", () => {
    expect(identifierFor("@ethdebug/format")).toBe("draft");
    expect(identifierFor("@ethdebug/bugc")).toBe("preview");
    expect(identifierFor("@ethdebug/format-web")).toBe("preview");
  });
});

describe("keywordProblems", () => {
  const stable = [
    manifest("@ethdebug/format", "0.1.0"),
    manifest("@ethdebug/bugc", "0.1.3"),
  ];
  const drafts = [
    manifest("@ethdebug/format", "0.1.0-draft.7"),
    manifest("@ethdebug/bugc", "0.1.0-preview.2"),
  ];

  it("accepts prerelease and patch without flags in any state", () => {
    expect(keywordProblems("prerelease", false, drafts)).toEqual([]);
    expect(keywordProblems("patch", false, drafts)).toEqual([]);
    expect(keywordProblems("prerelease", false, stable)).toEqual([]);
  });

  it("requires --all for a series start", () => {
    for (const keyword of ["preminor", "premajor", "minor", "major"]) {
      expect(keywordProblems(keyword, false, stable)).toEqual([
        `${keyword} starts a series for every workspace: pass --all`,
      ]);
      expect(keywordProblems(keyword, true, stable)).toEqual([]);
    }
  });

  it("rejects a series start while a prerelease exists", () => {
    const mixed = [
      manifest("@ethdebug/format", "0.1.0"),
      manifest("@ethdebug/format-web", "0.1.1-preview.0", [], true),
    ];
    expect(keywordProblems("preminor", true, mixed)).toEqual([
      "cannot start a series while @ethdebug/format-web is a " +
        "prerelease; run `patch` first",
    ]);
  });

  it("allows a series start when all are prereleases of one version", () => {
    expect(keywordProblems("preminor", true, drafts)).toEqual([]);
    expect(keywordProblems("premajor", true, drafts)).toEqual([]);
    const split = [
      manifest("@ethdebug/format", "0.1.0-draft.7"),
      manifest("@ethdebug/bugc", "0.1.1-preview.0"),
    ];
    expect(keywordProblems("preminor", true, split)).toHaveLength(1);
  });

  // minor/major on a prerelease graduate in place, so the exception
  // for one whole draft series must not admit them
  it("rejects minor and major while any prerelease exists", () => {
    const rejected = [
      "cannot start a series while @ethdebug/format, @ethdebug/bugc " +
        "are prereleases; run `patch` first",
    ];
    expect(keywordProblems("minor", true, drafts)).toEqual(rejected);
    expect(keywordProblems("major", true, drafts)).toEqual(rejected);
  });
});

describe("nextVersion", () => {
  it("switches a numeric prerelease to the named identifier", () => {
    expect(nextVersion("0.1.0-2", "prerelease", "@ethdebug/format", true)).toBe(
      "0.1.0-draft.0",
    );
    expect(nextVersion("0.1.0-2", "prerelease", "@ethdebug/bugc", true)).toBe(
      "0.1.0-preview.0",
    );
  });

  it("counts up, graduates, and starts series", () => {
    const n = (v: string, k: string) =>
      nextVersion(v, k, "@ethdebug/bugc", true);
    expect(n("0.1.0-preview.9", "prerelease")).toBe("0.1.0-preview.10");
    expect(n("0.1.0", "prerelease")).toBe("0.1.1-preview.0");
    expect(n("0.1.0-preview.4", "patch")).toBe("0.1.0");
    expect(n("0.1.0", "patch")).toBe("0.1.1");
    expect(n("0.1.3", "preminor")).toBe("0.2.0-preview.0");
    expect(n("0.1.3", "premajor")).toBe("1.0.0-preview.0");
    expect(n("0.1.7", "minor")).toBe("0.2.0");
    expect(n("0.1.7", "major")).toBe("1.0.0");
  });

  it(
    "keeps the manifest version for a workspace that was never " + "released",
    () => {
      expect(
        nextVersion("0.1.0-preview.0", "prerelease", "@ethdebug/codec", false),
      ).toBe("0.1.0-preview.0");
    },
  );

  it("throws when semver cannot increment", () => {
    expect(() =>
      nextVersion("banana", "patch", "@ethdebug/bugc", true),
    ).toThrow(/banana/);
  });
});

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

describe("parseChanged", () => {
  it("reads names from the JSON that follows any log noise", () => {
    const stdout = 'lerna notice\n[\n  { "name": "@ethdebug/evm" }\n]\n';
    expect(parseChanged(stdout, "", 0)).toEqual(["@ethdebug/evm"]);
  });

  it("is empty when Lerna says nothing changed", () => {
    expect(parseChanged("", "lerna info No changed packages found", 1)).toEqual(
      [],
    );
  });

  it("throws for any other failure", () => {
    expect(() => parseChanged("", "lerna ERR! boom", 1)).toThrow(/boom/);
    expect(() => parseChanged("", "", null)).toThrow(/lerna changed failed/);
  });
});

describe("forcedNames", () => {
  const ms = [
    manifest("@ethdebug/format", "0.1.0-draft.1"),
    manifest("@ethdebug/bugc", "0.1.0"),
    manifest("@ethdebug/evm", "0.1.1-preview.0"),
  ];

  it("forces the spec package when schemas changed", () => {
    expect(forcedNames(ms, "prerelease", true)).toEqual(["@ethdebug/format"]);
    expect(forcedNames(ms, "prerelease", false)).toEqual([]);
  });

  it("forces every prerelease workspace under patch", () => {
    expect(forcedNames(ms, "patch", false)).toEqual([
      "@ethdebug/format",
      "@ethdebug/evm",
    ]);
  });
});

describe("planMoves", () => {
  const ms = [
    manifest("@ethdebug/format", "0.1.0-draft.1"),
    manifest("@ethdebug/pointers", "0.1.0-preview.3", ["@ethdebug/format"]),
    manifest("@ethdebug/bugc", "0.1.0-preview.5", ["@ethdebug/pointers"]),
    manifest(
      "@ethdebug/format-web",
      "0.1.0-preview.2",
      ["@ethdebug/bugc"],
      true,
    ),
  ];
  const released = ms.map((m) => m.name);

  it("labels direct changes, dependents, and schema-driven moves", () => {
    const plan = planMoves({
      manifests: ms,
      listed: [
        "@ethdebug/format",
        "@ethdebug/pointers",
        "@ethdebug/bugc",
        "@ethdebug/format-web",
      ],
      directlyChanged: ["@ethdebug/bugc"],
      released,
      schemasChanged: true,
      keyword: "prerelease",
      all: false,
    });
    expect(plan).toEqual([
      {
        name: "@ethdebug/format",
        from: "0.1.0-draft.1",
        to: "0.1.0-draft.2",
        reason: "schemas",
        firstRelease: false,
      },
      {
        name: "@ethdebug/pointers",
        from: "0.1.0-preview.3",
        to: "0.1.0-preview.4",
        reason: "dependent",
        firstRelease: false,
      },
      {
        name: "@ethdebug/bugc",
        from: "0.1.0-preview.5",
        to: "0.1.0-preview.6",
        reason: "changed",
        firstRelease: false,
      },
      {
        name: "@ethdebug/format-web",
        from: "0.1.0-preview.2",
        to: "0.1.0-preview.3",
        reason: "dependent",
        firstRelease: false,
      },
    ]);
  });

  it("moves only listed workspaces without --all", () => {
    const plan = planMoves({
      manifests: ms,
      listed: ["@ethdebug/bugc", "@ethdebug/format-web"],
      directlyChanged: ["@ethdebug/bugc"],
      released,
      schemasChanged: false,
      keyword: "prerelease",
      all: false,
    });
    expect(plan.map((m) => m.name)).toEqual([
      "@ethdebug/bugc",
      "@ethdebug/format-web",
    ]);
  });

  it("labels graduations and --all moves", () => {
    const plan = planMoves({
      manifests: ms,
      listed: [
        "@ethdebug/format",
        "@ethdebug/pointers",
        "@ethdebug/bugc",
        "@ethdebug/format-web",
      ],
      directlyChanged: [],
      released,
      schemasChanged: false,
      keyword: "patch",
      all: false,
    });
    expect(plan.map((m) => [m.to, m.reason])).toEqual([
      ["0.1.0", "graduates"],
      ["0.1.0", "graduates"],
      ["0.1.0", "graduates"],
      ["0.1.0", "graduates"],
    ]);
    const all = planMoves({
      manifests: ms,
      listed: [],
      directlyChanged: [],
      released,
      schemasChanged: false,
      keyword: "prerelease",
      all: true,
    });
    expect(all.every((m) => m.reason === "all")).toBe(true);
  });

  it("keeps the manifest version of a never-released workspace", () => {
    const withNew = [
      ...ms,
      manifest("@ethdebug/codec", "0.1.0-preview.0", ["@ethdebug/format"]),
    ];
    const plan = planMoves({
      manifests: withNew,
      listed: ["@ethdebug/codec"],
      directlyChanged: ["@ethdebug/codec"],
      released,
      schemasChanged: false,
      keyword: "prerelease",
      all: false,
    });
    expect(plan).toEqual([
      {
        name: "@ethdebug/codec",
        from: "0.1.0-preview.0",
        to: "0.1.0-preview.0",
        reason: "changed",
        firstRelease: true,
      },
    ]);
  });
});

describe("planProblems", () => {
  const ms = [
    manifest("@ethdebug/format", "0.1.0-draft.1"),
    manifest("@ethdebug/bugc", "0.1.0", ["@ethdebug/format"]),
  ];
  const move = (
    name: string,
    from: string,
    to: string,
    reason: Move["reason"] = "changed",
  ): Move => ({ name, from, to, reason, firstRelease: false });

  it("is empty for a sane plan", () => {
    expect(
      planProblems(
        [move("@ethdebug/format", "0.1.0-draft.1", "0.1.0-draft.2")],
        ms,
        "prerelease",
      ),
    ).toEqual([]);
  });

  it("rejects a version that does not move forward", () => {
    expect(
      planProblems(
        [move("@ethdebug/bugc", "0.1.0-preview.3", "0.1.0-draft.0")],
        ms,
        "prerelease",
      ),
    ).toEqual([
      "@ethdebug/bugc: 0.1.0-draft.0 does not sort after 0.1.0-preview.3",
    ]);
  });

  it("rejects a stable workspace that depends on a prerelease", () => {
    expect(
      planProblems(
        [move("@ethdebug/bugc", "0.1.0-preview.3", "0.1.0", "graduates")],
        ms,
        "patch",
      ),
    ).toEqual([
      "@ethdebug/bugc: stable 0.1.0 would depend on " +
        "@ethdebug/format 0.1.0-draft.1",
    ]);
  });

  it("requires equal versions for a series start", () => {
    const plan = [
      move("@ethdebug/format", "0.1.0", "0.2.0-draft.0", "all"),
      move("@ethdebug/bugc", "0.1.7", "0.2.0-preview.0", "all"),
    ];
    expect(planProblems(plan, ms, "preminor")).toEqual([]);
    const split = [
      move("@ethdebug/format", "0.1.0", "0.2.0-draft.0", "all"),
      move("@ethdebug/bugc", "0.2.0", "0.3.0-preview.0", "all"),
    ];
    expect(planProblems(split, ms, "preminor")).toEqual([
      "a series start must give every workspace the same " +
        "major.minor.patch; got 0.2.0, 0.3.0",
    ]);
  });
});

describe("requiredChangelogs", () => {
  const ms = [
    manifest("@ethdebug/format", "0.1.0-draft.1"),
    manifest("@ethdebug/evm", "0.1.0-preview.3"),
    manifest("@ethdebug/format-web", "0.1.0-preview.2", [], true),
  ];

  it("lists the root file when the spec moves and each public package", () => {
    const plan: Move[] = [
      {
        name: "@ethdebug/format",
        from: "0.1.0-draft.1",
        to: "0.1.0-draft.2",
        reason: "schemas",
        firstRelease: false,
      },
      {
        name: "@ethdebug/evm",
        from: "0.1.0-preview.3",
        to: "0.1.0-preview.4",
        reason: "dependent",
        firstRelease: false,
      },
      {
        name: "@ethdebug/format-web",
        from: "0.1.0-preview.2",
        to: "0.1.0-preview.3",
        reason: "dependent",
        firstRelease: false,
      },
    ];
    expect(requiredChangelogs(plan, ms, "/repo")).toEqual([
      { path: "CHANGELOG.md", version: "0.1.0-draft.2" },
      { path: "packages/format/CHANGELOG.md", version: "0.1.0-draft.2" },
      { path: "packages/evm/CHANGELOG.md", version: "0.1.0-preview.4" },
    ]);
  });

  it("omits the root file when the spec does not move", () => {
    const plan: Move[] = [
      {
        name: "@ethdebug/evm",
        from: "0.1.0-preview.3",
        to: "0.1.0-preview.4",
        reason: "changed",
        firstRelease: false,
      },
    ];
    expect(requiredChangelogs(plan, ms, "/repo")).toEqual([
      { path: "packages/evm/CHANGELOG.md", version: "0.1.0-preview.4" },
    ]);
  });
});

describe("rewriteManifest", () => {
  const text =
    JSON.stringify(
      {
        name: "@ethdebug/bugc",
        version: "0.1.0-preview.5",
        dependencies: { "@ethdebug/evm": "^0.1.0-preview.3", lodash: "^4.0.0" },
        devDependencies: { "@ethdebug/format": "^0.1.0-draft.1" },
        peerDependencies: { "@ethdebug/pointers": "^0.1.0-preview.3" },
      },
      null,
      2,
    ) + "\n";
  const versions = new Map([
    ["@ethdebug/bugc", "0.1.0-preview.6"],
    ["@ethdebug/format", "0.1.0-draft.2"],
    ["@ethdebug/pointers", "0.1.0-preview.4"],
  ]);

  it("rewrites the version and every internal range, keeping the rest", () => {
    const out = JSON.parse(rewriteManifest(text, versions));
    expect(out.version).toBe("0.1.0-preview.6");
    expect(out.dependencies["@ethdebug/evm"]).toBe("^0.1.0-preview.3");
    expect(out.dependencies.lodash).toBe("^4.0.0");
    expect(out.devDependencies["@ethdebug/format"]).toBe("^0.1.0-draft.2");
    expect(out.peerDependencies["@ethdebug/pointers"]).toBe("^0.1.0-preview.4");
  });

  it(
    "preserves key order, two-space indentation and the trailing " + "newline",
    () => {
      const out = rewriteManifest(text, versions);
      expect(out.endsWith("}\n")).toBe(true);
      expect(out.indexOf('"name"')).toBeLessThan(out.indexOf('"version"'));
      expect(out.split("\n")[1]).toBe('  "name": "@ethdebug/bugc",');
    },
  );

  it(
    "leaves a manifest of a workspace that does not move untouched " +
      "except ranges",
    () => {
      const out = JSON.parse(
        rewriteManifest(text, new Map([["@ethdebug/format", "0.1.0-draft.2"]])),
      );
      expect(out.version).toBe("0.1.0-preview.5");
      expect(out.devDependencies["@ethdebug/format"]).toBe("^0.1.0-draft.2");
    },
  );
});

describe("undoAdvice", () => {
  it("removes the tags and the commit when this run committed", () => {
    expect(undoAdvice(["@ethdebug/evm@1.0.0"], true)).toBe(
      "undo: git tag -d @ethdebug/evm@1.0.0 && git reset --hard HEAD~1",
    );
  });

  it("removes the commit alone when it failed before any tag", () => {
    expect(undoAdvice([], true)).toBe("undo: git reset --hard HEAD~1");
  });

  // a first-release-only plan tags HEAD without committing
  it("removes the tags alone when no commit was made", () => {
    expect(
      undoAdvice(["@ethdebug/evm@1.0.0", "@ethdebug/bugc@1.0.0"], false),
    ).toBe("undo: git tag -d @ethdebug/evm@1.0.0 @ethdebug/bugc@1.0.0");
  });

  it("restores the manifests when nothing was committed or tagged", () => {
    expect(undoAdvice([], false)).toBe(
      "undo: git checkout HEAD -- packages/*/package.json schemas/",
    );
  });
});

// the premise of the first-release-only branch of commitAndTag: such a
// plan changes no manifest text, so there is nothing to commit
describe("a plan of first releases only", () => {
  it("rewrites no manifest, because each version already matches", () => {
    const text =
      JSON.stringify(
        {
          name: "@ethdebug/newcomer",
          version: "0.1.0",
          dependencies: { "@ethdebug/other": "^0.1.0" },
        },
        null,
        2,
      ) + "\n";
    const plan: Move[] = [
      {
        name: "@ethdebug/newcomer",
        from: "0.1.0",
        to: "0.1.0",
        reason: "changed",
        firstRelease: true,
      },
      {
        name: "@ethdebug/other",
        from: "0.1.0",
        to: "0.1.0",
        reason: "changed",
        firstRelease: true,
      },
    ];
    const versions = new Map(plan.map((move) => [move.name, move.to]));
    expect(rewriteManifest(text, versions)).toBe(text);
  });
});

describe("rewriteSchemaVersions", () => {
  const text = [
    "examples:",
    "  - ethdebug:",
    '      schema: "schema:ethdebug/format/program"',
    '      version: "0.1.0-draft.0"',
    "    compilation:",
    "      compiler:",
    "        version: 0.2.3+commit.8b37fa7a",
    '  # version: "0.1.0-draft.0" in a comment stays',
    "",
  ].join("\n");

  it("rewrites the quoted literal and leaves compiler versions alone", () => {
    const result = rewriteSchemaVersions(
      text,
      "0.1.0-draft.0",
      "0.1.0-draft.1",
    );
    expect(result.count).toBe(1);
    expect(result.text).toContain('version: "0.1.0-draft.1"');
    expect(result.text).toContain("version: 0.2.3+commit.8b37fa7a");
    expect(result.text).toContain('# version: "0.1.0-draft.0" in a comment');
  });

  it("accepts single quotes and no quotes, keeping the style", () => {
    expect(
      rewriteSchemaVersions(
        "version: '0.1.0-draft.0'\n",
        "0.1.0-draft.0",
        "0.2.0",
      ).text,
    ).toBe("version: '0.2.0'\n");
    expect(
      rewriteSchemaVersions(
        "  version: 0.1.0-draft.0\n",
        "0.1.0-draft.0",
        "0.2.0",
      ).text,
    ).toBe("  version: 0.2.0\n");
  });

  it("does not match a prefix of a longer version", () => {
    expect(
      rewriteSchemaVersions('version: "0.1.0-draft.10"\n', "0.1.0-draft.1", "x")
        .count,
    ).toBe(0);
  });

  it("keeps a trailing comment on the line it rewrites", () => {
    const result = rewriteSchemaVersions(
      '    version: "0.1.0-draft.0" # the spec version\n',
      "0.1.0-draft.0",
      "0.1.0-draft.1",
    );
    expect(result.count).toBe(1);
    expect(result.text).toBe(
      '    version: "0.1.0-draft.1" # the spec version\n',
    );
  });

  it("leaves the version mentioned in prose alone", () => {
    const prose = "    description: Written by 0.1.0-draft.0 producers.\n";
    expect(rewriteSchemaVersions(prose, "0.1.0-draft.0", "0.2.0")).toEqual({
      text: prose,
      count: 0,
    });
  });
});

describe("expectedVersionSites", () => {
  it("counts ethdebug blocks and the identification example", () => {
    const withBlocks =
      'examples:\n  - ethdebug:\n      schema: x\n      version: "1"\n' +
      '  - foo:\n    ethdebug:\n      version: "1"\n';
    expect(expectedVersionSites(withBlocks)).toBe(2);
    const identification =
      '$id: "schema:ethdebug/format/identification"\n' +
      'examples:\n  - schema: x\n    version: "1"\n';
    expect(expectedVersionSites(identification)).toBe(1);
  });

  // the property that declares the field is not an example of it
  it("ignores the ethdebug property of a root schema", () => {
    const root =
      '$id: "schema:ethdebug/format/program"\n' +
      "properties:\n  ethdebug:\n    allOf:\n      - $ref: x\n" +
      'examples:\n  - ethdebug:\n      version: "1"\n';
    expect(expectedVersionSites(root)).toBe(1);
  });

  // what the count check compares: a literal left behind falls short
  it("exceeds the count when an example keeps the old version", () => {
    const stale =
      'examples:\n  - ethdebug:\n      version: "0.1.0-draft.0"\n' +
      '  - ethdebug:\n      version: "0.1.0-draft.0"\n';
    const { count } = rewriteSchemaVersions(stale, "0.1.0-draft.1", "x");
    expect(count).toBeLessThan(expectedVersionSites(stale));
  });
});
