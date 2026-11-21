import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as git from "./release/git.js";
import { checkPackList, packList } from "./release/packlist.js";
import { distTag, parseReleaseTag, releaseVersions } from "./release/policy.js";
import {
  readWorkspaces,
  topoSort,
  type Workspace,
} from "./release/workspaces.js";

export const registry = "https://registry.npmjs.org";

export function npmEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.toLowerCase().startsWith("npm_config_")) {
      clean[key] = value;
    }
  }
  return clean;
}

export interface Tag {
  name: string;
  version: string;
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

export type ViewResult = "published" | "unpublished";

export interface View {
  result: ViewResult;
  versions: string[];
}

export function classifyView(
  status: number,
  stdout: string,
  version: string,
): View {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`npm view: unexpected output: ${stdout}`);
  }
  if (status !== 0) {
    const code = (parsed as { error?: { code?: string } }).error?.code;
    if (code === "E404") {
      return { result: "unpublished", versions: [] };
    }
    throw new Error(`npm view failed: ${code ?? stdout}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`npm view: unexpected non-array result: ${stdout}`);
  }
  const versions = parsed as string[];
  return {
    result: versions.includes(version) ? "published" : "unpublished",
    versions,
  };
}

export function viewVersions(name: string, version: string): View {
  const result = spawnSync(
    "npm",
    ["view", name, "versions", "--json", "--registry", registry],
    {
      encoding: "utf8",
      env: npmEnv(process.env),
    },
  );
  try {
    return classifyView(result.status ?? 1, result.stdout, version);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`);
  }
}

export function publishArgs(
  dryRun: boolean,
  env: NodeJS.ProcessEnv,
  tag: string,
): string[] {
  const args = [
    "publish",
    "--access",
    "public",
    "--tag",
    tag,
    "--registry",
    registry,
  ];
  if (env.GITHUB_ACTIONS) {
    args.push("--provenance");
  }
  if (dryRun) {
    args.push("--dry-run");
  }
  return args;
}

function publish(workspace: Workspace, dryRun: boolean, tag: string): void {
  const args = publishArgs(dryRun, process.env, tag);
  const result = spawnSync("npm", args, {
    cwd: workspace.dir,
    stdio: "inherit",
    env: npmEnv(process.env),
  });
  if (result.status !== 0) {
    throw new Error(`npm publish failed for ${workspace.name}`);
  }
}

export function main(argv: string[]): number {
  const dryRun = argv.includes("--dry-run");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tags = git
    .run(root, ["tag", "--points-at", "HEAD"])
    .split("\n")
    .flatMap((line) => parseReleaseTag(line) ?? []);
  if (tags.length === 0) {
    console.log("no @ethdebug package tags at HEAD; nothing to publish");
    return 0;
  }
  // the registry document can lag minutes behind a publish, tags do not
  const allTags = git.run(root, ["tag", "--list"]).split("\n");
  const selected = topoSort(selectPackages(tags, readWorkspaces(root)));
  const published: string[] = [];
  const skipped: string[] = [];
  let failed: string | undefined;
  try {
    for (const workspace of selected) {
      const label = `${workspace.name}@${workspace.version}`;
      failed = label;
      const view = viewVersions(workspace.name, workspace.version);
      if (view.result === "published") {
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
      const tag = distTag(workspace.version, [
        ...view.versions,
        ...releaseVersions(allTags, workspace.name),
      ]);
      console.log(
        `${label}: publishing under ${tag}${dryRun ? " (dry run)" : ""}`,
      );
      publish(workspace, dryRun, tag);
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
