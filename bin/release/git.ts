import { execFileSync, spawnSync } from "node:child_process";

export function run(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

// for a command whose exit status is the answer, not a failure
export function status(root: string, args: string[]): number {
  return spawnSync("git", args, { cwd: root, stdio: "pipe" }).status ?? 128;
}

export function tryRun(
  root: string,
  args: string[],
): { ok: boolean; stdout: string } {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}
