import { describe, expect, it } from "vitest";

import type { Plan } from "./release/plan.js";
import { versionSites } from "./release/schema-versions.js";
import type { Workspace } from "./release/workspaces.js";
import {
  check,
  decide,
  type Options,
  parseArgs,
  type Survey,
} from "./version.js";

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

const repo: Survey["repo"] = {
  branch: "main",
  dirty: false,
  tagsAtHead: [],
  nearestAnnotated: { name: "@ethdebug/format@0.1.0-draft.0", commit: "a" },
  nearestRelease: { name: "@ethdebug/format@0.1.0-draft.0", commit: "a" },
};

const surveyOf = (over: Partial<Survey> = {}): Survey => ({
  root: "/repo",
  workspaces: [],
  tags: [],
  directlyChanged: [],
  listed: [],
  specTag: undefined,
  schemasChanged: false,
  schemas: [],
  changelogs: [],
  repo,
  ...over,
});

function workspace(name: string, version: string): Workspace {
  const json = { name, version };
  return {
    name,
    version,
    dir: `/repo/packages/${name.replace("@ethdebug/", "")}`,
    private: false,
    text: `${JSON.stringify(json, null, 2)}\n`,
    json,
    runtime: [],
    peer: [],
    dev: [],
    optional: [],
    dependencies: [],
    all: [],
  };
}

const empty: Plan = { moves: [], manifests: [], schemas: [] };
const options: Options = { keyword: "prerelease", all: false, dryRun: true };

describe("check findings", () => {
  it("is silent on a clean repo on main", () => {
    expect(check(surveyOf(), empty, options).findings).toEqual([]);
  });

  it("reports a branch that is not main", () => {
    const survey = surveyOf({ repo: { ...repo, branch: "feature" } });
    expect(check(survey, empty, options).findings).toEqual([
      "on branch feature, not main",
    ]);
  });

  it("reports a dirty working tree", () => {
    const survey = surveyOf({ repo: { ...repo, dirty: true } });
    expect(check(survey, empty, options).findings).toEqual([
      "the working tree has uncommitted changes",
    ]);
  });

  it("reports a foreign annotated tag nearer than the release tag", () => {
    const survey = surveyOf({
      repo: { ...repo, nearestAnnotated: { name: "v9", commit: "b" } },
    });
    expect(check(survey, empty, options).findings).toEqual([
      "the nearest annotated tag v9 is not the nearest release tag " +
        "@ethdebug/format@0.1.0-draft.0; Lerna would miss changes " +
        "(a foreign tag, or a release tag that is not annotated)",
    ]);
  });

  it("reports a missing annotated release tag", () => {
    const survey = surveyOf({
      repo: { ...repo, nearestAnnotated: undefined },
    });
    expect(check(survey, empty, options).findings).toEqual([
      "no annotated release tag is reachable from HEAD",
    ]);
  });

  it("reports release tags at HEAD only when something changed", () => {
    const atHead = { ...repo, tagsAtHead: ["@ethdebug/a@0.1.0"] };
    expect(check(surveyOf({ repo: atHead }), empty, options).findings).toEqual(
      [],
    );

    const loud = surveyOf({ repo: atHead, directlyChanged: ["@ethdebug/a"] });
    expect(check(loud, empty, options).findings).toEqual([
      "HEAD already carries release tags: @ethdebug/a@0.1.0; " +
        "Lerna skips change detection here",
    ]);
  });

  it("reports the planned tags that already exist", () => {
    const survey = surveyOf({ tags: ["@ethdebug/a@0.1.1", "v9"] });
    const plan: Plan = {
      ...empty,
      moves: [
        {
          name: "@ethdebug/a",
          from: "0.1.0",
          to: "0.1.1",
          reason: "changed",
          firstRelease: false,
        },
      ],
    };
    expect(check(survey, plan, options).findings).toEqual([
      "tags already exist: @ethdebug/a@0.1.1",
    ]);
  });

  it("emits the findings in preflight's order", () => {
    const survey = surveyOf({
      directlyChanged: ["@ethdebug/a"],
      tags: ["@ethdebug/a@0.1.1"],
      repo: {
        branch: "feature",
        dirty: true,
        tagsAtHead: ["@ethdebug/a@0.1.0"],
        nearestAnnotated: { name: "v9", commit: "b" },
        nearestRelease: { name: "@ethdebug/a@0.1.0", commit: "a" },
      },
    });
    const plan: Plan = {
      ...empty,
      moves: [
        {
          name: "@ethdebug/a",
          from: "0.1.0",
          to: "0.1.1",
          reason: "changed",
          firstRelease: false,
        },
      ],
    };
    const { findings } = check(survey, plan, options);
    expect(findings).toHaveLength(5);
    expect(findings[0]).toContain("on branch");
    expect(findings[1]).toContain("uncommitted changes");
    expect(findings[2]).toContain("nearest annotated tag");
    expect(findings[3]).toContain("HEAD already carries");
    expect(findings[4]).toContain("tags already exist");
  });
});

const schemaText = [
  "examples:",
  "  - ethdebug:",
  '      schema: "ethdebug/format/info"',
  '      version: "0.1.0-draft.0"',
  "",
].join("\n");

const specSurvey = (version: string) =>
  surveyOf({
    workspaces: [workspace("@ethdebug/format", "0.1.0-draft.0")],
    tags: ["@ethdebug/format@0.1.0-draft.0"],
    listed: ["@ethdebug/format"],
    specTag: "@ethdebug/format@0.1.0-draft.0",
    schemasChanged: true,
    schemas: [
      {
        path: "schemas/info.schema.yaml",
        text: schemaText.replace("0.1.0-draft.0", version),
        sites: versionSites(schemaText.replace("0.1.0-draft.0", version)),
      },
    ],
  });

describe("decide", () => {
  it("rewrites the manifest and schema texts to the target version", () => {
    const plan = decide(specSurvey("0.1.0-draft.0"), options);
    expect(plan.moves).toEqual([
      {
        name: "@ethdebug/format",
        from: "0.1.0-draft.0",
        to: "0.1.0-draft.1",
        reason: "schemas",
        firstRelease: false,
      },
    ]);
    expect(plan.manifests).toEqual([
      {
        path: "packages/format/package.json",
        text:
          JSON.stringify(
            { name: "@ethdebug/format", version: "0.1.0-draft.1" },
            null,
            2,
          ) + "\n",
      },
    ]);
    expect(plan.schemas).toEqual([
      {
        path: "schemas/info.schema.yaml",
        text: schemaText.replace("0.1.0-draft.0", "0.1.0-draft.1"),
      },
    ]);
  });

  it("counts any tag named for the workspace as released", () => {
    const survey = surveyOf({
      workspaces: [workspace("@ethdebug/a", "0.1.0")],
      tags: ["@ethdebug/a@not-semver"],
      listed: ["@ethdebug/a"],
    });
    expect(decide(survey, options).moves[0].firstRelease).toBe(false);
  });
});

describe("check errors", () => {
  it("reports a drifted schema site when the spec package moves", () => {
    const survey = specSurvey("0.0.9");
    const plan = decide(survey, options);
    expect(check(survey, plan, options).errors).toEqual([
      "schemas/info.schema.yaml:4: examples/0/ethdebug names 0.0.9, " +
        "expected 0.1.0-draft.0",
    ]);
  });

  it("reports zero sites when the spec package moves", () => {
    const survey = surveyOf({
      ...specSurvey("0.1.0-draft.0"),
      schemas: [{ path: "schemas/x.schema.yaml", text: "", sites: [] }],
    });
    const plan = decide(survey, options);
    expect(check(survey, plan, options).errors).toEqual([
      "schemas/: no example names the specification version; " +
        "the release would rewrite nothing",
    ]);
  });

  it("puts the keyword guards before the plan problems", () => {
    const survey = surveyOf({
      workspaces: [workspace("@ethdebug/a", "0.1.0-preview.1")],
    });
    const backwards: Plan = {
      ...empty,
      moves: [
        {
          name: "@ethdebug/a",
          from: "0.1.0-preview.1",
          to: "0.1.0-preview.0",
          reason: "changed",
          firstRelease: false,
        },
      ],
    };
    const minor: Options = { keyword: "minor", all: false, dryRun: true };
    const errors = check(survey, backwards, minor).errors;
    expect(errors).toEqual([
      "minor starts a series for every workspace: pass --all",
      "cannot start a series while @ethdebug/a is a prerelease; " +
        "run `patch` first",
      "@ethdebug/a: 0.1.0-preview.0 does not sort after 0.1.0-preview.1",
    ]);
  });
});

describe("check changelogs", () => {
  it("reads the planned changelogs from the survey", () => {
    const survey = surveyOf({
      ...specSurvey("0.1.0-draft.0"),
      changelogs: [
        { path: "CHANGELOG.md", text: "## 0.1.0-draft.1\n\n- entry\n" },
        { path: "packages/format/CHANGELOG.md", text: undefined },
        { path: "packages/other/CHANGELOG.md", text: undefined },
      ],
    });
    const plan = decide(survey, options);
    expect(check(survey, plan, options).changelogs).toEqual([
      "packages/format/CHANGELOG.md: file is missing",
    ]);
  });
});
