import { spawnSync } from "node:child_process";

import { ignoredChanges } from "./policy.js";

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

export function lernaChanged(root: string, forced: string[]): string[] {
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
