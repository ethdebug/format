import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import semver from "semver";

// the schemas ship inside this package, so its version is the version
// of the specification
export const specPackage = "@ethdebug/format";

export const keywords = [
  "prerelease",
  "patch",
  "preminor",
  "premajor",
  "minor",
  "major",
] as const;
export type Keyword = (typeof keywords)[number];

// a series start moves every workspace to the same major.minor
export const seriesStartKeywords: Keyword[] = [
  "preminor",
  "premajor",
  "minor",
  "major",
];

// files whose change does not call for a release; the same list goes
// to `lerna changed` and to the direct-change diff, so the two agree
export const ignoredChanges = [
  "**/CHANGELOG.md",
  "**/*.test.ts",
  "**/*.test.tsx",
];

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
  // an empty positional is a usage error too, not a missing keyword
  if (positional.length > 1 || positional.some((arg) => !isKeyword(arg))) {
    throw new Error(
      "usage: tsx bin/version.ts [keyword] [--all] [--dry-run]\n" +
        `  keyword is one of: ${keywords.join(", ")} (default prerelease)`,
    );
  }
  return {
    keyword: positional[0] ?? "prerelease",
    all: options.includes("--all"),
    dryRun: options.includes("--dry-run"),
  };
}

export function identifierFor(name: string): "draft" | "preview" {
  return name === specPackage ? "draft" : "preview";
}

export interface Manifest {
  name: string;
  version: string;
  dir: string;
  private: boolean;
  // @ethdebug/* names over all four dependency kinds
  dependencies: string[];
  json: Record<string, unknown>;
}

function isPrerelease(version: string): boolean {
  return (semver.prerelease(version) ?? []).length > 0;
}

function tuple(version: string): string {
  const parsed = semver.parse(version);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : "";
}

// the guards of the series-start keywords
export function keywordProblems(
  keyword: string,
  all: boolean,
  manifests: Manifest[],
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

// `lerna changed` exits non-zero both when nothing changed and when it
// fails; only the first is an empty list
export function parseChanged(
  stdout: string,
  stderr: string,
  status: number | null,
): string[] {
  if (status !== 0) {
    if (/No changed packages/i.test(stderr)) {
      return [];
    }
    throw new Error(`lerna changed failed:\n${stderr.trim()}`);
  }
  const start = stdout.indexOf("[");
  if (start === -1) {
    return [];
  }
  const listed = JSON.parse(stdout.slice(start)) as { name: string }[];
  return listed.map(({ name }) => name);
}

// true when the changelog has a section for the version with at least
// one entry or sentence in it
export function hasReleaseSection(text: string, version: string): boolean {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line === `## ${version}` || line.startsWith(`## ${version} `),
  );
  if (start === -1) {
    return false;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.some(
    (line) =>
      line.trim().length > 0 &&
      !line.startsWith("#") &&
      !/^\[[^\]]+\]: /.test(line),
  );
}

export function hasUnreleasedEntries(text: string): boolean {
  return hasReleaseSection(text, "Unreleased");
}

export interface ChangelogFile {
  path: string;
  version: string;
  text: string | undefined;
}

export function changelogProblems(files: ChangelogFile[]): string[] {
  return files.flatMap(({ path, version, text }) => {
    if (text === undefined) {
      return [`${path}: file is missing`];
    }
    return [
      ...(hasReleaseSection(text, version)
        ? []
        : [`${path}: no "## ${version}" section with an entry`]),
      ...(hasUnreleasedEntries(text)
        ? [`${path}: entries remain under "## Unreleased"`]
        : []),
    ];
  });
}

const dependencyKinds = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export function readManifests(root: string): Manifest[] {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir)
    .filter((entry) => existsSync(join(packagesDir, entry, "package.json")))
    .map((entry) => {
      const dir = join(packagesDir, entry);
      const json = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8"),
      ) as Record<string, unknown>;
      const dependencies = dependencyKinds.flatMap((kind) =>
        Object.keys((json[kind] as Record<string, string> | undefined) ?? {}),
      );
      return {
        name: json.name as string,
        version: json.version as string,
        dir,
        private: json.private === true,
        dependencies: [...new Set(dependencies)].filter((dep) =>
          dep.startsWith("@ethdebug/"),
        ),
        json,
      };
    });
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
  manifests: Manifest[],
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
  manifests: Manifest[];
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
  manifests: Manifest[],
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
      for (const dep of manifest?.dependencies ?? []) {
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
  manifests: Manifest[],
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

// sets the version when the manifest's own workspace moves, and
// points every internal range at the new version of a moving workspace
export function rewriteManifest(
  text: string,
  versions: Map<string, string>,
): string {
  const json = JSON.parse(text) as Record<string, unknown>;
  const own = versions.get(json.name as string);
  if (own !== undefined) {
    json.version = own;
  }
  for (const kind of dependencyKinds) {
    const ranges = json[kind] as Record<string, string> | undefined;
    if (!ranges) {
      continue;
    }
    for (const [dep, version] of versions) {
      if (dep in ranges) {
        ranges[dep] = `^${version}`;
      }
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

// exit status of a git command that uses its status as a result
function gitStatus(root: string, args: string[]): number {
  const result = spawnSync("git", args, { cwd: root, stdio: "pipe" });
  return result.status ?? 128;
}

function lastSpecTag(root: string): string | undefined {
  const result = spawnSync(
    "git",
    ["describe", "--tags", "--abbrev=0", "--match", `${specPackage}@*`],
    { cwd: root, encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function schemasChangedSince(root: string, tag: string | undefined): boolean {
  if (tag === undefined) {
    return true;
  }
  const status = gitStatus(root, [
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

function releasedNames(root: string, manifests: Manifest[]): string[] {
  return manifests
    .filter((m) => git(root, ["tag", "--list", `${m.name}@*`]).length > 0)
    .map((m) => m.name);
}

// pathspecs for one workspace directory with the ignored files removed
function workspacePathspecs(root: string, manifest: Manifest): string[] {
  const dir = relative(root, manifest.dir);
  return [
    `:(top)${dir}`,
    ...ignoredChanges.map((glob) => `:(top,exclude,glob)${dir}/${glob}`),
  ];
}

function directlyChangedNames(root: string, manifests: Manifest[]): string[] {
  return manifests
    .filter((m) => {
      const tag = `${m.name}@${m.version}`;
      if (git(root, ["tag", "--list", tag]).length === 0) {
        return true;
      }
      const status = gitStatus(root, [
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

function lernaChanged(root: string, forced: string[]): string[] {
  const args = ["-s", "lerna", "changed", "--all", "--json"];
  for (const glob of ignoredChanges) {
    args.push("--ignore-changes", glob);
  }
  if (forced.length > 0) {
    args.push(`--force-publish=${forced.join(",")}`);
  }
  const result = spawnSync("yarn", args, { cwd: root, encoding: "utf8" });
  return parseChanged(result.stdout ?? "", result.stderr ?? "", result.status);
}

// Lerna finds the last release with a plain `git describe`, annotated
// tags only and no name filter. The nearest annotated tag must
// therefore be the nearest release tag, lightweight ones included.
function tagCheck(root: string): string | undefined {
  const annotated = spawnSync(
    "git",
    ["describe", "--first-parent", "--abbrev=0"],
    { cwd: root, encoding: "utf8" },
  );
  const release = spawnSync(
    "git",
    [
      "describe",
      "--tags",
      "--first-parent",
      "--abbrev=0",
      "--match",
      "@ethdebug/*@*",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (annotated.status !== 0 || release.status !== 0) {
    return "no annotated release tag is reachable from HEAD";
  }
  const a = git(root, ["rev-list", "-n", "1", annotated.stdout.trim()]);
  const r = git(root, ["rev-list", "-n", "1", release.stdout.trim()]);
  if (a !== r) {
    return (
      `the nearest annotated tag ${annotated.stdout.trim()} is not the ` +
      `nearest release tag ${release.stdout.trim()}; Lerna would miss ` +
      "changes (a foreign tag, or a release tag that is not annotated)"
    );
  }
  return undefined;
}

function existingTags(root: string, plan: Move[]): string[] {
  return plan
    .map((move) => `${move.name}@${move.to}`)
    .filter((tag) => git(root, ["tag", "--list", tag]).length > 0);
}

function releaseTagsAtHead(root: string): string[] {
  return git(root, ["tag", "--points-at", "HEAD", "--list", "@ethdebug/*@*"])
    .split("\n")
    .filter((tag) => tag.length > 0);
}

function preflight(
  root: string,
  plan: Move[],
  directlyChanged: string[],
): string[] {
  const findings: string[] = [];
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    findings.push(`on branch ${branch}, not main`);
  }
  if (git(root, ["status", "--porcelain", "--untracked-files=no"]).length > 0) {
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
  manifests: Manifest[],
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
    git(root, ["add", "--", ...files]);
    git(root, ["commit", "--no-verify", "--quiet", "-m", "Publish"]);
  } else {
    // a plan of first releases only: each manifest already carries the
    // version it is tagged at, so there is nothing to commit
    console.log("no manifest changed; tagging HEAD");
  }
  for (const move of plan) {
    const tag = `${move.name}@${move.to}`;
    git(root, ["tag", "-a", tag, "-m", tag]);
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
  return "undo: git checkout HEAD -- packages/*/package.json";
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
  const manifests = readManifests(root);

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
  const headBefore = git(root, ["rev-parse", "HEAD"]);
  let written: string[] = [];
  const created: string[] = [];
  try {
    written = writeManifests(root, manifests, plan);
    commitAndTag(root, written, plan, created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bump failed: ${message}`);
    const committed = git(root, ["rev-parse", "HEAD"]) !== headBefore;
    console.error(undoAdvice(created, committed));
    return 1;
  }
  console.log(`tagged: ${created.join(", ")}`);
  if (written.length > 0) {
    console.log(`committed Publish with ${written.length} manifest(s)`);
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
