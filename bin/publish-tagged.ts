import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPackList, packList } from "./packlist.js";

export interface Workspace {
  name: string;
  version: string;
  dir: string;
  private: boolean;
  dependencies: string[];
}

export interface Tag {
  name: string;
  version: string;
}

export function parseTags(lines: string[]): Tag[] {
  const tags: Tag[] = [];
  for (const line of lines) {
    const match = /^(@ethdebug\/[^@]+)@(.+)$/.exec(line.trim());
    if (match) {
      tags.push({ name: match[1], version: match[2] });
    }
  }
  return tags;
}

export function readWorkspaces(root: string): Workspace[] {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir)
    .filter((entry) => existsSync(join(packagesDir, entry, "package.json")))
    .map((entry) => {
      const dir = join(packagesDir, entry);
      const manifest = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8"),
      ) as {
        name: string;
        version: string;
        private?: boolean;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const dependencies = Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      }).filter((dep) => dep.startsWith("@ethdebug/"));
      return {
        name: manifest.name,
        version: manifest.version,
        dir,
        private: manifest.private === true,
        dependencies,
      };
    });
}

export function selectPackages(
  tags: Tag[],
  workspaces: Workspace[],
): Workspace[] {
  const selected: Workspace[] = [];
  for (const tag of tags) {
    const workspace = workspaces.find((w) => w.name === tag.name);
    if (!workspace) {
      console.warn(`${tag.name}: no such workspace, ignoring`);
      continue;
    }
    if (workspace.private) {
      continue;
    }
    if (workspace.version !== tag.version) {
      throw new Error(
        `${tag.name}: tag version ${tag.version} does not match ` +
          `manifest version ${workspace.version}`,
      );
    }
    selected.push(workspace);
  }
  return selected;
}

export function topoSort(workspaces: Workspace[]): Workspace[] {
  const byName = new Map(workspaces.map((w) => [w.name, w]));
  const done = new Set<string>();
  const sorted: Workspace[] = [];
  const visit = (workspace: Workspace, trail: string[]) => {
    if (done.has(workspace.name)) {
      return;
    }
    if (trail.includes(workspace.name)) {
      throw new Error(`dependency cycle: ${trail.join(" -> ")}`);
    }
    for (const dep of workspace.dependencies) {
      const target = byName.get(dep);
      if (target) {
        visit(target, [...trail, workspace.name]);
      }
    }
    done.add(workspace.name);
    sorted.push(workspace);
  };
  for (const workspace of workspaces) {
    visit(workspace, []);
  }
  return sorted;
}

export type ViewResult = "published" | "unpublished";

export function classifyView(
  status: number,
  stdout: string,
  version: string,
): ViewResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`npm view: unexpected output: ${stdout}`);
  }
  if (status !== 0) {
    const code = (parsed as { error?: { code?: string } }).error?.code;
    if (code === "E404") {
      return "unpublished";
    }
    throw new Error(`npm view failed: ${code ?? stdout}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`npm view: unexpected non-array result: ${stdout}`);
  }
  return parsed.includes(version) ? "published" : "unpublished";
}

export function viewVersions(name: string, version: string): ViewResult {
  const result = spawnSync("npm", ["view", name, "versions", "--json"], {
    encoding: "utf8",
  });
  try {
    return classifyView(result.status ?? 1, result.stdout, version);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`);
  }
}

export function publishArgs(dryRun: boolean, env: NodeJS.ProcessEnv): string[] {
  const args = ["publish", "--access", "public", "--tag", "latest"];
  if (env.GITHUB_ACTIONS) {
    args.push("--provenance");
  }
  if (dryRun) {
    args.push("--dry-run");
  }
  return args;
}

function publish(workspace: Workspace, dryRun: boolean): void {
  const args = publishArgs(dryRun, process.env);
  const result = spawnSync("npm", args, {
    cwd: workspace.dir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`npm publish failed for ${workspace.name}`);
  }
}

export function main(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tagLines = execFileSync("git", ["tag", "--points-at", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).split("\n");
  const tags = parseTags(tagLines);
  if (tags.length === 0) {
    console.log("no @ethdebug package tags at HEAD; nothing to publish");
    return 0;
  }
  const selected = topoSort(selectPackages(tags, readWorkspaces(root)));
  const published: string[] = [];
  const skipped: string[] = [];
  let failed: string | undefined;
  try {
    for (const workspace of selected) {
      const label = `${workspace.name}@${workspace.version}`;
      failed = label;
      if (viewVersions(workspace.name, workspace.version) === "published") {
        console.log(`${label}: already published, skipping`);
        skipped.push(label);
        failed = undefined;
        continue;
      }
      const bad = checkPackList(packList(workspace.dir));
      if (bad.length > 0) {
        throw new Error(
          `${label}: disallowed files in tarball:\n  ${bad.join("\n  ")}`,
        );
      }
      console.log(`${label}: publishing${dryRun ? " (dry run)" : ""}`);
      publish(workspace, dryRun);
      published.push(label);
      failed = undefined;
    }
  } finally {
    console.log(`published: ${published.join(", ") || "none"}`);
    console.log(`skipped: ${skipped.join(", ") || "none"}`);
    console.log(`failed: ${failed ?? "none"}`);
  }
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
