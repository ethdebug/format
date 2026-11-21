import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type Applied,
  ApplyFailure,
  applyRelease,
  undoAdvice,
} from "./release/apply.js";
import { type ChangelogFile, changelogProblems } from "./release/changelog.js";
import * as git from "./release/git.js";
import { lernaChanged } from "./release/lerna.js";
import {
  forcedNames,
  keywordProblems,
  type Plan,
  planMoves,
  planProblems,
  requiredChangelogs,
} from "./release/plan.js";
import {
  ignoredChanges,
  keywords,
  type Keyword,
  releaseTag,
  parseReleaseTag,
  isReleaseTag,
  scope,
  specPackage,
} from "./release/policy.js";
import {
  checkVersions,
  readSchemas,
  type SchemaFile,
  setVersions,
} from "./release/schema-versions.js";
import {
  readWorkspaces,
  rewriteManifest,
  type Workspace,
} from "./release/workspaces.js";

export interface Options {
  keyword: Keyword;
  all: boolean;
  dryRun: boolean;
}

function isKeyword(value: string): value is Keyword {
  return (keywords as readonly string[]).includes(value);
}

export function parseArgs(argv: string[]): Options {
  const options = argv.filter((arg) => arg.startsWith("--"));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = options.filter(
    (arg) => arg !== "--all" && arg !== "--dry-run",
  );
  if (unknown.length > 0) {
    throw new Error(`unknown option: ${unknown.join(", ")}`);
  }
  const keyword = positional[0];
  // an empty positional is a usage error too, not a missing keyword
  if (positional.length > 1 || (keyword !== undefined && !isKeyword(keyword))) {
    throw new Error(
      "usage: tsx bin/version.ts [keyword] [--all] [--dry-run]\n" +
        `  keyword is one of: ${keywords.join(", ")} (default prerelease)`,
    );
  }
  return {
    keyword: keyword ?? "prerelease",
    all: options.includes("--all"),
    dryRun: options.includes("--dry-run"),
  };
}

export interface Survey {
  root: string;
  workspaces: Workspace[];
  // every tag in the repository, unfiltered; policy decides which are
  // releases, so a glob and a regex cannot disagree
  tags: string[];
  // names whose own directory differs from their tag, ignores applied
  directlyChanged: string[];
  // `lerna changed`, forced names and their dependents included
  listed: string[];
  specTag: string | undefined;
  schemasChanged: boolean;
  schemas: SchemaFile[];
  // the root file and every public package's, read whether or not the
  // plan needs them, so `check` can filter in memory
  changelogs: Omit<ChangelogFile, "version">[];
  repo: {
    branch: string;
    dirty: boolean;
    tagsAtHead: string[];
    nearestAnnotated: { name: string; commit: string } | undefined;
    nearestRelease: { name: string; commit: string } | undefined;
  };
}

export interface Problems {
  // guards and plan problems: exit 1, even under --dry-run
  errors: string[];
  // repo state: blocks a real run
  findings: string[];
  // uncut changelogs: block a real run, printed after the report
  changelogs: string[];
}

function changedSince(root: string, tag: string, paths: string[]): boolean {
  const status = git.status(root, [
    "diff",
    "--quiet",
    tag,
    "HEAD",
    "--",
    ...paths,
  ]);
  if (status !== 0 && status !== 1) {
    throw new Error(`git diff against ${tag} failed`);
  }
  return status === 1;
}

// pathspecs for one workspace directory with the ignored files removed
function workspacePathspecs(root: string, workspace: Workspace): string[] {
  const dir = relative(root, workspace.dir);
  return [
    `:(top)${dir}`,
    ...ignoredChanges.map((glob) => `:(top,exclude,glob)${dir}/${glob}`),
  ];
}

// the nearest tag `git describe` finds, and the commit it names
function nearest(root: string, args: string[]) {
  const found = git.tryRun(root, [
    "describe",
    "--first-parent",
    "--abbrev=0",
    ...args,
  ]);
  if (!found.ok) {
    return undefined;
  }
  const commit = git.run(root, ["rev-list", "-n", "1", found.stdout]);
  return { name: found.stdout, commit };
}

function readText(root: string, path: string): string | undefined {
  const full = join(root, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
}

// the only read: everything this run needs from git, Lerna and disk
export function surveyRelease(
  root: string,
  workspaces: Workspace[],
  options: Options,
): Survey {
  const tags = git.run(root, ["tag", "--list"]).split("\n").filter(Boolean);
  const described = git.tryRun(root, [
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    `${specPackage}@*`,
  ]);
  const specTag = described.ok ? described.stdout : undefined;
  const schemasChanged =
    specTag === undefined || changedSince(root, specTag, ["schemas/"]);
  // the one decision inside the read: --force-publish needs the names
  const forced = forcedNames(workspaces, options.keyword, schemasChanged);
  const directlyChanged = workspaces
    .filter((w) => {
      const tag = releaseTag(w.name, w.version);
      return (
        !tags.includes(tag) ||
        changedSince(root, tag, workspacePathspecs(root, w))
      );
    })
    .map((w) => w.name);
  const changelogPaths = [
    "CHANGELOG.md",
    ...workspaces
      .filter((w) => !w.private)
      .map((w) => join(relative(root, w.dir), "CHANGELOG.md")),
  ];
  const releaseGlob = `${scope}*@*`;
  return {
    root,
    workspaces,
    tags,
    directlyChanged,
    listed: lernaChanged(root, forced),
    specTag,
    schemasChanged,
    schemas: readSchemas(root),
    changelogs: changelogPaths.map((path) => ({
      path,
      text: readText(root, path),
    })),
    repo: {
      branch: git.run(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      dirty:
        git.run(root, ["status", "--porcelain", "--untracked-files=no"])
          .length > 0,
      tagsAtHead: git
        .run(root, ["tag", "--points-at", "HEAD"])
        .split("\n")
        .filter(isReleaseTag),
      nearestAnnotated: nearest(root, []),
      nearestRelease: nearest(root, ["--tags", "--match", releaseGlob]),
    },
  };
}

function specMove(plan: Plan) {
  return plan.moves.find((move) => move.name === specPackage);
}

// pure: the moves, and the exact bytes a real run would write
export function decide(survey: Survey, options: Options): Plan {
  const { root, workspaces, tags } = survey;
  const moves = planMoves({
    manifests: workspaces,
    listed: survey.listed,
    directlyChanged: survey.directlyChanged,
    released: workspaces
      .filter((w) => tags.some((t) => parseReleaseTag(t)?.name === w.name))
      .map((w) => w.name),
    schemasChanged: survey.schemasChanged,
    keyword: options.keyword,
    all: options.all,
  });
  const versions = new Map(moves.map((move) => [move.name, move.to]));
  const manifests = workspaces.map((w) => ({
    path: relative(root, join(w.dir, "package.json")),
    before: w.text,
    text: rewriteManifest(w.text, versions),
  }));
  // the schemas ship inside @ethdebug/format, so their examples name
  // the version it moves to; when it stays put they are left alone
  const spec = moves.find((move) => move.name === specPackage);
  const schemas = survey.schemas.map((file) => ({
    path: file.path,
    before: file.text,
    text: spec ? setVersions(file.text, spec.to) : file.text,
  }));
  const changed = (files: typeof manifests) =>
    files
      .filter((file) => file.text !== file.before)
      .map(({ path, text }) => ({ path, text }));
  return { moves, manifests: changed(manifests), schemas: changed(schemas) };
}

// Lerna finds the last release with a plain `git describe`, so the
// nearest annotated tag must be the nearest release tag, lightweight
// ones included
function tagCheck(repo: Survey["repo"]): string[] {
  const { nearestAnnotated: annotated, nearestRelease: release } = repo;
  if (annotated === undefined || release === undefined) {
    return ["no annotated release tag is reachable from HEAD"];
  }
  if (annotated.commit !== release.commit) {
    return [
      `the nearest annotated tag ${annotated.name} is not the ` +
        `nearest release tag ${release.name}; Lerna would miss ` +
        "changes (a foreign tag, or a release tag that is not annotated)",
    ];
  }
  return [];
}

// pure; the order of each list is the order it prints in
export function check(survey: Survey, plan: Plan, options: Options): Problems {
  const { workspaces, repo } = survey;
  const spec = specMove(plan);
  const sites = survey.schemas.flatMap((file) => file.sites);
  const errors = [
    ...keywordProblems(options.keyword, options.all, workspaces),
    ...planProblems(plan.moves, workspaces, options.keyword),
    ...(spec !== undefined && sites.length === 0
      ? [
          "schemas/: no example names the specification version; " +
            "the release would rewrite nothing",
        ]
      : []),
    ...(spec === undefined
      ? []
      : survey.schemas.flatMap((file) => checkVersions(file, spec.from))),
  ];

  const findings: string[] = [];
  if (repo.branch !== "main") {
    findings.push(`on branch ${repo.branch}, not main`);
  }
  if (repo.dirty) {
    findings.push("the working tree has uncommitted changes");
  }
  findings.push(...tagCheck(repo));
  // with a release tag at HEAD, `lerna changed` reports "Current HEAD
  // is already released" and lists nothing, so the listing hides every
  // change. Release tags at HEAD are legitimate right after a
  // first-release-only plan, which tags HEAD without committing: there
  // is then nothing left to release and the next run must still work.
  // The finding therefore fires only when a direct change exists, that
  // is when the empty listing really is hiding something.
  if (survey.directlyChanged.length > 0 && repo.tagsAtHead.length > 0) {
    findings.push(
      `HEAD already carries release tags: ${repo.tagsAtHead.join(", ")}; ` +
        "Lerna skips change detection here",
    );
  }
  const taken = plan.moves
    .map((move) => releaseTag(move.name, move.to))
    .filter((tag) => survey.tags.includes(tag));
  if (taken.length > 0) {
    findings.push(`tags already exist: ${taken.join(", ")}`);
  }

  const texts = new Map(
    survey.changelogs.map((file) => [file.path, file.text]),
  );
  const changelogs = changelogProblems(
    requiredChangelogs(plan.moves, workspaces, survey.root).map((file) => ({
      ...file,
      text: texts.get(file.path),
    })),
  );
  return { errors, findings, changelogs };
}

// prints the findings, then the moves and the changelog problems
export function report(
  survey: Survey,
  plan: Plan,
  problems: Problems,
  options: Options,
): void {
  // findings come before the nothing-moves line: a release tag at HEAD
  // is exactly what makes the plan look empty
  for (const finding of problems.findings) {
    console.log(`not ready to bump: ${finding}`);
  }
  if (plan.moves.length === 0) {
    console.log("nothing to release: no workspace changed since its tag");
    return;
  }
  console.log(`${options.keyword}: ${plan.moves.length} workspace(s) move`);
  const width = Math.max(...plan.moves.map((move) => move.name.length));
  for (const move of plan.moves) {
    const arrow = move.firstRelease
      ? `first release -> ${move.to}`
      : `${move.from} -> ${move.to}`;
    console.log(`  ${move.name.padEnd(width)}  ${arrow}  (${move.reason})`);
  }
  const spec = specMove(plan);
  if (spec !== undefined) {
    const count = survey.schemas.flatMap((file) => file.sites).length;
    console.log(`  schemas: ${count} version literals -> ${spec.to}`);
  }
  if (problems.changelogs.length > 0) {
    console.log("changelogs not cut for this release:");
    for (const problem of problems.changelogs) {
      console.log(`  ${problem}`);
    }
  }
}

function reportApplied(plan: Plan, applied: Applied): void {
  const { written, created } = applied;
  const schemaCount = plan.schemas.length;
  console.log(`tagged: ${created.join(", ")}`);
  if (written.length > 0) {
    const schemaNote =
      schemaCount > 0 ? ` and ${schemaCount} schema file(s)` : "";
    console.log(
      `committed Publish with ${written.length - schemaCount} ` +
        `manifest(s)${schemaNote}`,
    );
    console.log("next: git push --atomic origin main --follow-tags");
    return;
  }
  // publish.yml runs `on: push: branches: [main]`; with no commit the
  // push moves no branch, so nothing triggers it
  console.log(
    "no commit was made: the push moves no branch and publish.yml " +
      "will not trigger; push the tags (`git push origin --tags`) and " +
      "then dispatch the workflow or publish locally, see RELEASING.md",
  );
}

export function main(argv: string[]): number {
  const options = parseArgs(argv);
  const root = fileURLToPath(new URL("..", import.meta.url));

  // the workspaces are cheap, and the keyword guard must stay cheap:
  // `minor` without --all fails before any git or Lerna work
  const workspaces = readWorkspaces(root);
  const guard = keywordProblems(options.keyword, options.all, workspaces);
  if (guard.length > 0) {
    guard.forEach((problem) => console.error(problem));
    return 1;
  }

  const survey = surveyRelease(root, workspaces, options);
  console.log(
    survey.schemasChanged
      ? `schemas/ changed since ${survey.specTag ?? "the beginning"}`
      : `schemas/ unchanged since ${survey.specTag}`,
  );
  const plan = decide(survey, options);
  const problems = check(survey, plan, options);
  if (problems.errors.length > 0) {
    problems.errors.forEach((problem) => console.error(problem));
    return 1;
  }
  report(survey, plan, problems, options);
  if (plan.moves.length === 0) {
    return 0;
  }
  if (options.dryRun) {
    return 0;
  }
  if (problems.findings.length > 0 || problems.changelogs.length > 0) {
    console.error("fix the items above, then re-run");
    return 1;
  }
  try {
    reportApplied(plan, applyRelease(root, plan));
    return 0;
  } catch (error) {
    if (!(error instanceof ApplyFailure)) {
      throw error;
    }
    console.error(`bump failed: ${error.message}`);
    console.error(undoAdvice(error.created, error.committed));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
