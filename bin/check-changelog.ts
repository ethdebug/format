import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  formatProblemsMessage,
  impactLineProblems,
  sectionProblems,
} from "./release/changelog.js";
import * as git from "./release/git.js";
import { readWorkspaces } from "./release/workspaces.js";

const defaultBase = "origin/main";

function touchesSchemas(changedPaths: string[]): boolean {
  return changedPaths.some((path) => path.startsWith("schemas/"));
}

// colocated test files carry no consumer-visible change, and this also
// covers the *.examples.test.ts suites
const testFile = /\.test\.tsx?$/;

function touchesPackage(changedPaths: string[], prefix: string): boolean {
  return changedPaths.some(
    (path) =>
      !testFile.test(path) &&
      (path.startsWith(`${prefix}/src/`) ||
        path.startsWith(`${prefix}/bin/`) ||
        path === `${prefix}/package.json`),
  );
}

export function missingPackageChangelogs(
  changedPaths: string[],
  packagePrefixes: string[],
): string[] {
  const changed = new Set(changedPaths);
  return packagePrefixes
    .filter((prefix) => touchesPackage(changedPaths, prefix))
    .map((prefix) => `${prefix}/CHANGELOG.md`)
    .filter((path) => !changed.has(path));
}

export function needsChangelog(
  changedPaths: string[],
  packagePrefixes: string[] = [],
): boolean {
  const schemasViolation =
    touchesSchemas(changedPaths) && !changedPaths.includes("CHANGELOG.md");
  return (
    schemasViolation ||
    missingPackageChangelogs(changedPaths, packagePrefixes).length > 0
  );
}

export function changelogMessage(
  changedPaths: string[],
  packagePrefixes: string[] = [],
): string {
  const lines: string[] = [];

  if (touchesSchemas(changedPaths) && !changedPaths.includes("CHANGELOG.md")) {
    const schemaPaths = changedPaths.filter((path) =>
      path.startsWith("schemas/"),
    );
    lines.push(
      "This PR changes schema files without updating CHANGELOG.md:",
      ...schemaPaths.map((path) => `  ${path}`),
      "",
      'Add an entry under "## Unreleased" in CHANGELOG.md.',
    );
  }

  const missing = missingPackageChangelogs(changedPaths, packagePrefixes);
  if (missing.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(
      "This PR changes package files without updating the matching",
      "package CHANGELOG.md:",
      ...missing.map((path) => `  ${path}`),
      "",
      'Add an entry under "## Unreleased" in each file listed above.',
    );
  }

  if (lines.length > 0) {
    lines.push(
      "",
      'Apply the "changelog: skip" label to this PR if no entry is needed.',
    );
  }

  return lines.join("\n");
}

function resolvesToCommit(root: string, ref: string): boolean {
  return (
    git.status(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${ref}^{commit}`,
    ]) === 0
  );
}

function changedPaths(root: string, base: string): string[] {
  const stdout = git.run(root, ["diff", "--name-only", `${base}...HEAD`]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function publicPackagePrefixes(root: string): string[] {
  return readWorkspaces(root)
    .filter((workspace) => !workspace.private)
    .map((workspace) => relative(root, workspace.dir));
}

export function main(argv: string[]): number {
  const base = argv[0] ?? defaultBase;
  const root = fileURLToPath(new URL("..", import.meta.url));
  if (!resolvesToCommit(root, base)) {
    console.error(
      `check-changelog: cannot resolve the base ref "${base}"; fetch it` +
        " first, or name one that exists.",
    );
    return 1;
  }
  const paths = changedPaths(root, base);
  const packagePrefixes = publicPackagePrefixes(root);
  // the format lint runs on every diff, not only on schema changes
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const problems = [
    ...impactLineProblems(changelog),
    ...sectionProblems(changelog),
  ];
  const messages = [
    changelogMessage(paths, packagePrefixes),
    formatProblemsMessage(problems),
  ].filter((message) => message.length > 0);
  if (messages.length > 0) {
    console.error(messages.join("\n\n"));
    return 1;
  }
  console.log("changelog: ok");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
