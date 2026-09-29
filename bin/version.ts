import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ApplyFailure, applyRelease, undoAdvice } from "./release/apply.js";
import { changelogProblems } from "./release/changelog.js";
import * as git from "./release/git.js";
import { lernaChanged } from "./release/lerna.js";
import {
  forcedNames,
  keywordProblems,
  type Move,
  planMoves,
  planProblems,
  requiredChangelogs,
} from "./release/plan.js";
import {
  ignoredChanges,
  keywords,
  type Keyword,
  specPackage,
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

  const versions = new Map(plan.map((move) => [move.name, move.to]));
  const manifestTexts = manifests
    .map((manifest) => ({
      path: relative(root, join(manifest.dir, "package.json")),
      before: manifest.text,
      text: rewriteManifest(manifest.text, versions),
    }))
    .filter((file) => file.text !== file.before)
    .map(({ path, text }) => ({ path, text }));
  let applied;
  try {
    applied = applyRelease(root, {
      moves: plan,
      manifests: manifestTexts,
      schemas,
    });
  } catch (error) {
    if (!(error instanceof ApplyFailure)) {
      throw error;
    }
    console.error(`bump failed: ${error.message}`);
    console.error(undoAdvice(error.created, error.committed));
    return 1;
  }
  const { written, created } = applied;
  const schemaCount = schemas.length;
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
