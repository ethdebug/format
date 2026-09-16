import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readWorkspaces, topoSort, type Workspace } from "./publish-tagged.js";

export function siblingTarballs(
  workspace: Workspace,
  built: Map<string, string>,
): string[] {
  return workspace.dependencies
    .map((dep) => built.get(dep))
    .filter((path): path is string => path !== undefined);
}

function lastNonEmptyLine(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  if (!last) {
    throw new Error("npm pack: produced no output");
  }
  return last;
}

function pack(workspace: Workspace, destDir: string): string {
  const stdout = execFileSync("npm", ["pack", "--pack-destination", destDir], {
    cwd: workspace.dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return join(destDir, lastNonEmptyLine(stdout));
}

interface Attempt {
  status: number;
  stderr: string;
}

function npmInstall(consumerDir: string, tarballs: string[]): Attempt {
  const result = spawnSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs],
    { cwd: consumerDir, encoding: "utf8" },
  );
  return { status: result.status ?? 1, stderr: result.stderr ?? "" };
}

function importCheck(consumerDir: string, name: string): Attempt {
  const result = spawnSync(
    "node",
    ["--input-type=module", "-e", `await import(${JSON.stringify(name)})`],
    { cwd: consumerDir, encoding: "utf8" },
  );
  return { status: result.status ?? 1, stderr: result.stderr ?? "" };
}

function bugcHelp(consumerDir: string): Attempt {
  const bin = join(consumerDir, "node_modules", ".bin", "bugc");
  const result = spawnSync(bin, ["--help"], {
    cwd: consumerDir,
    encoding: "utf8",
  });
  return { status: result.status ?? 1, stderr: result.stderr ?? "" };
}

function consumerName(workspace: Workspace): string {
  return workspace.name.replace("@ethdebug/", "");
}

// A dependency two or more hops away (e.g. evm -> pointers -> format)
// is not passed as an install target, so npm resolves it against the
// real registry unless told otherwise. @ethdebug/format is already
// published there under an older, incompatible build, so every
// @ethdebug/* package built so far in this run is pinned via
// "overrides", except the workspace itself and its direct
// dependencies: those are already installed as explicit root
// dependencies via the tarball arguments, and npm rejects an
// override that conflicts with a root package's own direct
// dependency.
function overridesFor(
  workspace: Workspace,
  built: Map<string, string>,
): Record<string, string> {
  const skip = new Set([workspace.name, ...workspace.dependencies]);
  const overrides: Record<string, string> = {};
  for (const [name, tarball] of built) {
    if (!skip.has(name)) {
      overrides[name] = `file:${tarball}`;
    }
  }
  return overrides;
}

function makeConsumerDir(
  tmp: string,
  workspace: Workspace,
  built: Map<string, string>,
): string {
  const dir = join(tmp, `consumer-${consumerName(workspace)}`);
  mkdirSync(dir, { recursive: true });
  const overrides = overridesFor(workspace, built);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "consumer",
      private: true,
      type: "module",
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    }),
  );
  return dir;
}

function report(name: string, failure: Attempt): void {
  console.error(`${name}: FAIL`);
  console.error(failure.stderr);
}

export function main(): number {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const workspaces = topoSort(
    readWorkspaces(root).filter((workspace) => !workspace.private),
  );

  const tmp = mkdtempSync(join(tmpdir(), "ethdebug-smoke-"));
  const built = new Map<string, string>();
  let failed = false;

  try {
    for (const workspace of workspaces) {
      const tarball = pack(workspace, tmp);
      const siblings = siblingTarballs(workspace, built);
      built.set(workspace.name, tarball);

      const consumerDir = makeConsumerDir(tmp, workspace, built);

      const install = npmInstall(consumerDir, [tarball, ...siblings]);
      if (install.status !== 0) {
        failed = true;
        report(workspace.name, install);
        continue;
      }

      const imported = importCheck(consumerDir, workspace.name);
      if (imported.status !== 0) {
        failed = true;
        report(workspace.name, imported);
        continue;
      }

      if (workspace.name === "@ethdebug/bugc") {
        const help = bugcHelp(consumerDir);
        if (help.status !== 0) {
          failed = true;
          report(workspace.name, help);
          continue;
        }
      }

      console.log(`${workspace.name}: ok`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
