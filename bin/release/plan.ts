import { join, relative } from "node:path";

import semver from "semver";

import {
  identifierFor,
  isPrerelease,
  seriesStartKeywords,
  specPackage,
  tuple,
} from "./policy.js";
import type { Workspace } from "./workspaces.js";

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

export interface Plan {
  moves: Move[];
  // rewritten package.json and schema yaml, computed purely, so
  // --dry-run holds the exact bytes a real run would write
  manifests: { path: string; text: string }[];
  schemas: { path: string; text: string }[];
}
