import { writeFileSync } from "node:fs";
import { join } from "node:path";

import * as git from "./git.js";
import type { Move, Plan } from "./plan.js";
import { releaseTag } from "./policy.js";

export interface Applied {
  written: string[];
  created: string[];
  committed: boolean;
}

export class ApplyFailure extends Error {
  constructor(
    readonly created: string[],
    readonly committed: boolean,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
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
    const tag = releaseTag(move.name, move.to);
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

export function applyRelease(root: string, plan: Plan): Applied {
  // HEAD before the writes: the only reliable sign of whether this run
  // committed, since HEAD already is a Publish commit after a release
  const headBefore = git.run(root, ["rev-parse", "HEAD"]);
  const created: string[] = [];
  const written: string[] = [];
  try {
    for (const { path, text } of [...plan.manifests, ...plan.schemas]) {
      writeFileSync(join(root, path), text);
      written.push(path);
    }
    commitAndTag(root, written, plan.moves, created);
  } catch (error) {
    const committed = git.run(root, ["rev-parse", "HEAD"]) !== headBefore;
    throw new ApplyFailure(created, committed, error);
  }
  return { written, created, committed: written.length > 0 };
}
