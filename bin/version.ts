import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import semver from "semver";

import { changelogProblems } from "./release/changelog.js";
import * as git from "./release/git.js";
import { lernaChanged } from "./release/lerna.js";
import {
  identifierFor,
  ignoredChanges,
  isPrerelease,
  keywords,
  type Keyword,
  seriesStartKeywords,
  specPackage,
  tuple,
} from "./release/policy.js";
import {
  checkVersions,
  readSchemas,
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

// the guards of the series-start keywords
export function keywordProblems(
  keyword: string,
  all: boolean,
  manifests: Workspace[],
): string[] {
  if (!(seriesStartKeywords as string[]).includes(keyword)) {
    return [];
  }
  const problems: string[] = [];
  if (!all) {
    problems.push(`${keyword} starts a series for every workspace: pass --all`);
  }
  const prereleases = manifests.filter((m) => isPrerelease(m.version));
  const tuples = new Set(manifests.map((m) => tuple(m.version)));
  // a whole-repository draft series can be abandoned for the next draft
  // series without a stable release, so `preminor` / `premajor` may run
  // while every workspace is a prerelease of one and the same X.Y.Z.
  // `minor` / `major` must NOT take that exception: on a prerelease
  // they graduate in place (0.1.0-draft.3 + minor -> 0.1.0), which is
  // an unannounced stable release, not a series start.
  const graduatesInPlace = keyword === "minor" || keyword === "major";
  const wholeSeries =
    !graduatesInPlace &&
    prereleases.length === manifests.length &&
    tuples.size === 1;
  if (prereleases.length > 0 && !wholeSeries) {
    const names = prereleases.map((m) => m.name).join(", ");
    problems.push(
      `cannot start a series while ${names} ${
        prereleases.length === 1 ? "is a prerelease" : "are prereleases"
      }; run \`patch\` first`,
    );
  }
  return problems;
}

// a workspace that was never released keeps the version its manifest
// carries: that is its first version, and it is tagged at it
export function nextVersion(
  current: string,
  keyword: string,
  name: string,
  released: boolean,
): string {
  if (!released) {
    return current;
  }
  const next = semver.inc(
    current,
    keyword as semver.ReleaseType,
    identifierFor(name),
  );
  if (next === null) {
    throw new Error(`cannot apply ${keyword} to ${name}@${current}`);
  }
  return next;
}

export type Reason = "changed" | "schemas" | "graduates" | "dependent" | "all";

export interface Move {
  name: string;
  from: string;
  to: string;
  reason: Reason;
  firstRelease: boolean;
}

// names to pass to `lerna changed --force-publish`; Lerna then adds
// their transitive dependents
export function forcedNames(
  manifests: Workspace[],
  keyword: string,
  schemasChanged: boolean,
): string[] {
  const forced = schemasChanged ? [specPackage] : [];
  if (keyword === "patch") {
    for (const manifest of manifests) {
      if (isPrerelease(manifest.version) && !forced.includes(manifest.name)) {
        forced.push(manifest.name);
      }
    }
  }
  return forced;
}

export interface PlanInput {
  manifests: Workspace[];
  // names from `lerna changed`, forced names and dependents included
  listed: string[];
  // names whose own directory differs from their tag, ignores applied
  directlyChanged: string[];
  // names that have at least one release tag
  released: string[];
  schemasChanged: boolean;
  keyword: string;
  all: boolean;
}

export function planMoves(input: PlanInput): Move[] {
  const { manifests, listed, directlyChanged, released, keyword } = input;
  return manifests
    .filter((m) => input.all || listed.includes(m.name))
    .map((m) => {
      const firstRelease = !released.includes(m.name);
      let reason: Reason;
      if (directlyChanged.includes(m.name) || firstRelease) {
        reason = "changed";
      } else if (m.name === specPackage && input.schemasChanged) {
        reason = "schemas";
      } else if (keyword === "patch" && isPrerelease(m.version)) {
        reason = "graduates";
      } else if (listed.includes(m.name)) {
        reason = "dependent";
      } else {
        reason = "all";
      }
      return {
        name: m.name,
        from: m.version,
        to: nextVersion(m.version, keyword, m.name, !firstRelease),
        reason,
        firstRelease,
      };
    });
}

export function planProblems(
  plan: Move[],
  manifests: Workspace[],
  keyword: string,
): string[] {
  const problems: string[] = [];
  const after = new Map(manifests.map((m) => [m.name, m.version]));
  for (const move of plan) {
    after.set(move.name, move.to);
  }
  for (const move of plan) {
    if (!move.firstRelease && !semver.gt(move.to, move.from)) {
      problems.push(
        `${move.name}: ${move.to} does not sort after ${move.from}`,
      );
    }
    if (!isPrerelease(move.to)) {
      const manifest = manifests.find((m) => m.name === move.name);
      for (const dep of manifest?.all ?? []) {
        const version = after.get(dep);
        if (version !== undefined && isPrerelease(version)) {
          problems.push(
            `${move.name}: stable ${move.to} would depend on ${dep} ${version}`,
          );
        }
      }
    }
  }
  if ((seriesStartKeywords as string[]).includes(keyword)) {
    // identifiers differ (draft / preview); the tuple must not
    const tuples = [...new Set(plan.map((move) => tuple(move.to)))];
    if (tuples.length > 1) {
      problems.push(
        "a series start must give every workspace the same " +
          `major.minor.patch; got ${tuples.join(", ")}`,
      );
    }
  }
  return problems;
}

// the changelogs the release must have cut, each with the version its
// heading must carry
export function requiredChangelogs(
  plan: Move[],
  manifests: Workspace[],
  root: string,
): { path: string; version: string }[] {
  const spec = plan.find((move) => move.name === specPackage);
  const root_ = spec ? [{ path: "CHANGELOG.md", version: spec.to }] : [];
  const packages = plan.flatMap((move) => {
    const manifest = manifests.find((m) => m.name === move.name);
    if (!manifest || manifest.private) {
      return [];
    }
    return [
      {
        path: join(relative(root, manifest.dir), "CHANGELOG.md"),
        version: move.to,
      },
    ];
  });
  return [...root_, ...packages];
}

function lastSpecTag(root: string): string | undefined {
  const result = git.tryRun(root, [
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    `${specPackage}@*`,
  ]);
  return result.ok ? result.stdout : undefined;
}

function schemasChangedSince(root: string, tag: string | undefined): boolean {
  if (tag === undefined) {
    return true;
  }
  const status = git.status(root, [
    "diff",
    "--quiet",
    tag,
    "HEAD",
    "--",
    "schemas/",
  ]);
  if (status !== 0 && status !== 1) {
    throw new Error(`git diff against ${tag} failed`);
  }
  return status === 1;
}

function releasedNames(root: string, manifests: Workspace[]): string[] {
  return manifests
    .filter((m) => git.run(root, ["tag", "--list", `${m.name}@*`]).length > 0)
    .map((m) => m.name);
}

// pathspecs for one workspace directory with the ignored files removed
function workspacePathspecs(root: string, manifest: Workspace): string[] {
  const dir = relative(root, manifest.dir);
  return [
    `:(top)${dir}`,
    ...ignoredChanges.map((glob) => `:(top,exclude,glob)${dir}/${glob}`),
  ];
}

function directlyChangedNames(root: string, manifests: Workspace[]): string[] {
  return manifests
    .filter((m) => {
      const tag = `${m.name}@${m.version}`;
      if (git.run(root, ["tag", "--list", tag]).length === 0) {
        return true;
      }
      const status = git.status(root, [
        "diff",
        "--quiet",
        tag,
        "HEAD",
        "--",
        ...workspacePathspecs(root, m),
      ]);
      if (status !== 0 && status !== 1) {
        throw new Error(`git diff against ${tag} failed`);
      }
      return status === 1;
    })
    .map((m) => m.name);
}

// Lerna finds the last release with a plain `git describe`, annotated
// tags only and no name filter. The nearest annotated tag must
// therefore be the nearest release tag, lightweight ones included.
function tagCheck(root: string): string | undefined {
  const annotated = git.tryRun(root, [
    "describe",
    "--first-parent",
    "--abbrev=0",
  ]);
  const release = git.tryRun(root, [
    "describe",
    "--tags",
    "--first-parent",
    "--abbrev=0",
    "--match",
    "@ethdebug/*@*",
  ]);
  if (!annotated.ok || !release.ok) {
    return "no annotated release tag is reachable from HEAD";
  }
  const a = git.run(root, ["rev-list", "-n", "1", annotated.stdout]);
  const r = git.run(root, ["rev-list", "-n", "1", release.stdout]);
  if (a !== r) {
    return (
      `the nearest annotated tag ${annotated.stdout} is not the ` +
      `nearest release tag ${release.stdout}; Lerna would miss ` +
      "changes (a foreign tag, or a release tag that is not annotated)"
    );
  }
  return undefined;
}

function existingTags(root: string, plan: Move[]): string[] {
  return plan
    .map((move) => `${move.name}@${move.to}`)
    .filter((tag) => git.run(root, ["tag", "--list", tag]).length > 0);
}

function releaseTagsAtHead(root: string): string[] {
  return git
    .run(root, ["tag", "--points-at", "HEAD", "--list", "@ethdebug/*@*"])
    .split("\n")
    .filter((tag) => tag.length > 0);
}

function preflight(
  root: string,
  plan: Move[],
  directlyChanged: string[],
): string[] {
  const findings: string[] = [];
  const branch = git.run(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    findings.push(`on branch ${branch}, not main`);
  }
  if (
    git.run(root, ["status", "--porcelain", "--untracked-files=no"]).length > 0
  ) {
    findings.push("the working tree has uncommitted changes");
  }
  const tags = tagCheck(root);
  if (tags !== undefined) {
    findings.push(tags);
  }
  // with a release tag at HEAD, `lerna changed` reports "Current HEAD
  // is already released" and lists nothing, so the listing hides every
  // change. Release tags at HEAD are legitimate right after a
  // first-release-only plan, which tags HEAD without committing: there
  // is then nothing left to release and the next run must still work.
  // The finding therefore fires only when a direct change exists, that
  // is when the empty listing really is hiding something.
  if (directlyChanged.length > 0) {
    const atHead = releaseTagsAtHead(root);
    if (atHead.length > 0) {
      findings.push(
        `HEAD already carries release tags: ${atHead.join(", ")}; ` +
          "Lerna skips change detection here",
      );
    }
  }
  const taken = existingTags(root, plan);
  if (taken.length > 0) {
    findings.push(`tags already exist: ${taken.join(", ")}`);
  }
  return findings;
}

function writeManifests(
  root: string,
  manifests: Workspace[],
  plan: Move[],
): string[] {
  const versions = new Map(plan.map((move) => [move.name, move.to]));
  const written: string[] = [];
  for (const manifest of manifests) {
    const path = join(manifest.dir, "package.json");
    const before = readFileSync(path, "utf8");
    const after = rewriteManifest(before, versions);
    if (after !== before) {
      writeFileSync(path, after);
      written.push(relative(root, path));
    }
  }
  return written;
}

// appends every tag it creates to `created`, so a failure partway
// leaves the caller with the exact list to undo
function commitAndTag(
  root: string,
  files: string[],
  plan: Move[],
  created: string[],
): void {
  if (files.length > 0) {
    git.run(root, ["add", "--", ...files]);
    git.run(root, ["commit", "--no-verify", "--quiet", "-m", "Publish"]);
  } else {
    // a plan of first releases only: each manifest already carries the
    // version it is tagged at, so there is nothing to commit
    console.log("no manifest changed; tagging HEAD");
  }
  for (const move of plan) {
    const tag = `${move.name}@${move.to}`;
    git.run(root, ["tag", "-a", tag, "-m", tag]);
    created.push(tag);
  }
}

// what a failed bump left behind, and how to remove it
export function undoAdvice(created: string[], committed: boolean): string {
  const tags = created.length > 0 ? `git tag -d ${created.join(" ")}` : "";
  if (committed) {
    const prefix = tags.length > 0 ? `${tags} && ` : "";
    return `undo: ${prefix}git reset --hard HEAD~1`;
  }
  if (tags.length > 0) {
    return `undo: ${tags}`;
  }
  return "undo: git checkout HEAD -- packages/*/package.json schemas/";
}

function report(plan: Move[]): void {
  const width = Math.max(...plan.map((move) => move.name.length));
  for (const move of plan) {
    const arrow = move.firstRelease
      ? `first release -> ${move.to}`
      : `${move.from} -> ${move.to}`;
    console.log(`  ${move.name.padEnd(width)}  ${arrow}  (${move.reason})`);
  }
}

export function main(argv: string[]): number {
  const { keyword, all, dryRun } = parseArgs(argv);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const manifests = readWorkspaces(root);

  const guard = keywordProblems(keyword, all, manifests);
  if (guard.length > 0) {
    for (const problem of guard) {
      console.error(problem);
    }
    return 1;
  }

  const specTag = lastSpecTag(root);
  const schemasChanged = schemasChangedSince(root, specTag);
  console.log(
    schemasChanged
      ? `schemas/ changed since ${specTag ?? "the beginning"}`
      : `schemas/ unchanged since ${specTag}`,
  );
  const forced = forcedNames(manifests, keyword, schemasChanged);
  const directlyChanged = directlyChangedNames(root, manifests);
  const plan = planMoves({
    manifests,
    listed: lernaChanged(root, forced),
    directlyChanged,
    released: releasedNames(root, manifests),
    schemasChanged,
    keyword,
    all,
  });
  const problems = planProblems(plan, manifests, keyword);
  // the schemas ship inside @ethdebug/format, so their examples name
  // the version it moves to; when it stays put they are left alone
  const specMove = plan.find((move) => move.name === specPackage);
  let schemas: { path: string; text: string }[] = [];
  let siteCount = 0;
  if (specMove !== undefined) {
    const files = readSchemas(root);
    siteCount = files.flatMap((file) => file.sites).length;
    if (siteCount === 0) {
      problems.push(
        "schemas/: no example names the specification version; " +
          "the release would rewrite nothing",
      );
    }
    problems.push(
      ...files.flatMap((file) => checkVersions(file, specMove.from)),
    );
    schemas = files
      .map((file) => ({
        path: file.path,
        text: setVersions(file.text, specMove.to),
        before: file.text,
      }))
      .filter((file) => file.text !== file.before)
      .map(({ path, text }) => ({ path, text }));
  }
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    return 1;
  }

  // findings come before the nothing-moves exit: a release tag at HEAD
  // is exactly what makes the plan look empty
  const findings = preflight(root, plan, directlyChanged);
  for (const finding of findings) {
    console.log(`not ready to bump: ${finding}`);
  }
  if (plan.length === 0) {
    console.log("nothing to release: no workspace changed since its tag");
    return 0;
  }
  console.log(`${keyword}: ${plan.length} workspace(s) move`);
  report(plan);
  if (specMove !== undefined) {
    const literals = `${siteCount} version literals`;
    console.log(`  schemas: ${literals} -> ${specMove.to}`);
  }

  const changelogs = changelogProblems(
    requiredChangelogs(plan, manifests, root).map(({ path, version }) => ({
      path,
      version,
      text: existsSync(join(root, path))
        ? readFileSync(join(root, path), "utf8")
        : undefined,
    })),
  );
  if (changelogs.length > 0) {
    console.log("changelogs not cut for this release:");
    for (const problem of changelogs) {
      console.log(`  ${problem}`);
    }
  }
  if (dryRun) {
    return 0;
  }
  if (findings.length > 0 || changelogs.length > 0) {
    console.error("fix the items above, then re-run");
    return 1;
  }

  // HEAD right before the writes: the only reliable sign of whether
  // this run committed, since HEAD already is a Publish commit after
  // every release
  const headBefore = git.run(root, ["rev-parse", "HEAD"]);
  let written: string[] = [];
  let schemaCount = 0;
  const created: string[] = [];
  try {
    written = writeManifests(root, manifests, plan);
    for (const { path, text } of schemas) {
      writeFileSync(join(root, path), text);
      written.push(path);
    }
    schemaCount = schemas.length;
    commitAndTag(root, written, plan, created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bump failed: ${message}`);
    const committed = git.run(root, ["rev-parse", "HEAD"]) !== headBefore;
    console.error(undoAdvice(created, committed));
    return 1;
  }
  console.log(`tagged: ${created.join(", ")}`);
  if (written.length > 0) {
    const schemaNote =
      schemaCount > 0 ? ` and ${schemaCount} schema file(s)` : "";
    console.log(
      `committed Publish with ${written.length - schemaCount} ` +
        `manifest(s)${schemaNote}`,
    );
    console.log("next: git push --atomic origin main --follow-tags");
    return 0;
  }
  // publish.yml runs `on: push: branches: [main]`; with no commit the
  // push moves no branch, so nothing triggers it
  console.log(
    "no commit was made: the push moves no branch and publish.yml " +
      "will not trigger; push the tags (`git push origin --tags`) and " +
      "then dispatch the workflow or publish locally, see RELEASING.md",
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
