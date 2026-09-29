import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { scope } from "./policy.js";

export interface Workspace {
  name: string;
  version: string;
  dir: string;
  private: boolean;
  // the raw manifest, because `decide` computes the rewritten text
  text: string;
  json: Record<string, unknown>;
  // @ethdebug/* names, per kind
  runtime: string[];
  peer: string[];
  dev: string[];
  optional: string[];
  // runtime + peer, deduplicated: exactly what publish ordering and
  // the tarball smoke test have always meant by "dependencies"
  dependencies: string[];
  // all four kinds in manifest order, for the range rewriting and the
  // stable-depends-on-prerelease check
  all: string[];
}

const kinds = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function names(
  json: Record<string, unknown>,
  kind: (typeof kinds)[number],
): string[] {
  const ranges = json[kind] as Record<string, string> | undefined;
  return Object.keys(ranges ?? {}).filter((dep) => dep.startsWith(scope));
}

export function readWorkspaces(root: string): Workspace[] {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir)
    .filter((entry) => existsSync(join(packagesDir, entry, "package.json")))
    .map((entry) => {
      const dir = join(packagesDir, entry);
      const text = readFileSync(join(dir, "package.json"), "utf8");
      const json = JSON.parse(text) as Record<string, unknown>;
      const runtime = names(json, "dependencies");
      const dev = names(json, "devDependencies");
      const peer = names(json, "peerDependencies");
      const optional = names(json, "optionalDependencies");
      return {
        name: json.name as string,
        version: json.version as string,
        dir,
        private: json.private === true,
        text,
        json,
        runtime,
        peer,
        dev,
        optional,
        dependencies: [...new Set([...runtime, ...peer])],
        all: [...new Set([...runtime, ...dev, ...peer, ...optional])],
      };
    });
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
  for (const kind of kinds) {
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
