import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyView,
  npmEnv,
  parseTags,
  publishArgs,
  readWorkspaces,
  registry,
  selectPackages,
  topoSort,
  viewVersions,
  type Workspace,
} from "./publish-tagged.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

const ws = (
  name: string,
  version: string,
  deps: string[] = [],
  isPrivate = false,
): Workspace => ({
  name,
  version,
  dir: `/repo/packages/${name.replace("@ethdebug/", "")}`,
  private: isPrivate,
  dependencies: deps,
});

describe("parseTags", () => {
  it("keeps only @ethdebug package tags", () => {
    expect(
      parseTags(["@ethdebug/format@0.1.0-1", "v1", "@other/x@1.0.0", ""]),
    ).toEqual([{ name: "@ethdebug/format", version: "0.1.0-1" }]);
  });
});

describe("selectPackages", () => {
  const workspaces = [
    ws("@ethdebug/format", "0.1.0-1"),
    ws("@ethdebug/format-web", "0.1.0-1", [], true),
  ];

  it("skips private packages", () => {
    expect(
      selectPackages(
        [
          { name: "@ethdebug/format", version: "0.1.0-1" },
          { name: "@ethdebug/format-web", version: "0.1.0-1" },
        ],
        workspaces,
      ).map((w) => w.name),
    ).toEqual(["@ethdebug/format"]);
  });

  it("errors on a tag/manifest version mismatch", () => {
    expect(() =>
      selectPackages(
        [{ name: "@ethdebug/format", version: "0.1.0-2" }],
        workspaces,
      ),
    ).toThrow(/0\.1\.0-2.*0\.1\.0-1/);
  });

  it("warns and ignores a tag with no matching workspace", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = selectPackages(
      [{ name: "@ethdebug/nope", version: "1.0.0" }],
      workspaces,
    );
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "@ethdebug/nope: no such workspace, ignoring",
    );
    warn.mockRestore();
  });
});

describe("topoSort", () => {
  it("orders dependencies before dependents, including peers", () => {
    const sorted = topoSort([
      ws("@ethdebug/evm", "1", ["@ethdebug/pointers"]),
      ws("@ethdebug/pointers", "1", ["@ethdebug/format"]),
      ws("@ethdebug/format", "1"),
    ]).map((w) => w.name);
    expect(sorted).toEqual([
      "@ethdebug/format",
      "@ethdebug/pointers",
      "@ethdebug/evm",
    ]);
  });
});

describe("classifyView", () => {
  it("treats E404 as unpublished", () => {
    expect(
      classifyView(1, '{"error":{"code":"E404","summary":"x"}}', "0.1.0-1"),
    ).toBe("unpublished");
  });
  it("treats a version present in the array as published", () => {
    expect(classifyView(0, '["0.1.0-0","0.1.0-1"]', "0.1.0-1")).toBe(
      "published",
    );
  });
  it("treats a version absent from the array as unpublished", () => {
    expect(classifyView(0, '["0.1.0-0"]', "0.1.0-1")).toBe("unpublished");
  });
  it("aborts on any other error", () => {
    expect(() =>
      classifyView(1, '{"error":{"code":"ETIMEDOUT"}}', "0.1.0-1"),
    ).toThrow(/ETIMEDOUT/);
  });
  it("aborts on a non-array success", () => {
    expect(() => classifyView(0, '"0.1.0-1"', "0.1.0-1")).toThrow(/unexpected/);
  });
});

describe("npmEnv", () => {
  it("strips npm_config_* keys regardless of case", () => {
    const cleaned = npmEnv({
      npm_config_registry: "https://registry.yarnpkg.com",
      NPM_CONFIG_REGISTRY: "https://registry.yarnpkg.com",
      npm_config_user_agent: "yarn/1.22.0 npm/? node/v20",
      PATH: "/usr/bin",
      HOME: "/home/gnidan",
      GITHUB_ACTIONS: "true",
    });
    expect(cleaned).not.toHaveProperty("npm_config_registry");
    expect(cleaned).not.toHaveProperty("NPM_CONFIG_REGISTRY");
    expect(cleaned).not.toHaveProperty("npm_config_user_agent");
    expect(cleaned.PATH).toBe("/usr/bin");
    expect(cleaned.HOME).toBe("/home/gnidan");
    expect(cleaned.GITHUB_ACTIONS).toBe("true");
  });
});

describe("viewVersions", () => {
  it("prefixes the package name on a probe failure", () => {
    const result: SpawnSyncReturns<string> = {
      pid: 1,
      output: [null, "", ""],
      stdout: '{"error":{"code":"ETIMEDOUT"}}',
      stderr: "",
      status: 1,
      signal: null,
    };
    vi.mocked(spawnSync).mockReturnValue(result);
    expect(() => viewVersions("@ethdebug/format", "0.1.0-1")).toThrow(
      /@ethdebug\/format/,
    );
  });

  it("targets registry.npmjs.org and strips yarn's registry env", () => {
    const originalRegistry = process.env.npm_config_registry;
    process.env.npm_config_registry = "https://registry.yarnpkg.com";
    try {
      const result: SpawnSyncReturns<string> = {
        pid: 1,
        output: [null, "", ""],
        stdout: '["0.1.0-1"]',
        stderr: "",
        status: 0,
        signal: null,
      };
      vi.mocked(spawnSync).mockReturnValue(result);
      viewVersions("@ethdebug/format", "0.1.0-1");
      const [command, args, options] = vi.mocked(spawnSync).mock.calls[0];
      expect(command).toBe("npm");
      expect(args).toContain("--registry");
      expect(args).toContain(registry);
      const passedEnv = (options as { env?: NodeJS.ProcessEnv }).env ?? {};
      expect(passedEnv).not.toHaveProperty("npm_config_registry");
    } finally {
      if (originalRegistry === undefined) {
        delete process.env.npm_config_registry;
      } else {
        process.env.npm_config_registry = originalRegistry;
      }
    }
  });
});

describe("readWorkspaces", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("merges dependencies and peerDependencies, filtered", () => {
    root = mkdtempSync(join(tmpdir(), "ws-"));
    const packagesDir = join(root, "packages");
    mkdirSync(join(packagesDir, "a"), { recursive: true });
    mkdirSync(join(packagesDir, "b"), { recursive: true });
    mkdirSync(join(packagesDir, "c"), { recursive: true });
    writeFileSync(
      join(packagesDir, "a", "package.json"),
      JSON.stringify({ name: "@ethdebug/a", version: "1.0.0" }),
    );
    writeFileSync(
      join(packagesDir, "b", "package.json"),
      JSON.stringify({
        name: "@ethdebug/b",
        version: "1.0.0",
        dependencies: { "@ethdebug/a": "^1.0.0", lodash: "^4" },
        peerDependencies: { "@ethdebug/c": "^1.0.0" },
      }),
    );
    writeFileSync(
      join(packagesDir, "c", "package.json"),
      JSON.stringify({
        name: "@ethdebug/c",
        version: "1.0.0",
        private: true,
      }),
    );
    writeFileSync(join(packagesDir, ".DS_Store"), "");

    const workspaces = readWorkspaces(root);
    expect(workspaces).toHaveLength(3);
    expect(workspaces.some((w) => w.dir.endsWith(".DS_Store"))).toBe(false);

    const byName = new Map(workspaces.map((w) => [w.name, w]));
    expect(byName.get("@ethdebug/a")?.dependencies).toEqual([]);
    expect(byName.get("@ethdebug/b")?.dependencies).toEqual([
      "@ethdebug/a",
      "@ethdebug/c",
    ]);
    expect(byName.get("@ethdebug/c")?.private).toBe(true);
    for (const name of ["a", "b", "c"]) {
      const dir = byName.get(`@ethdebug/${name}`)?.dir ?? "";
      expect(dir.endsWith(join("packages", name))).toBe(true);
    }
  });
});

describe("publishArgs", () => {
  it("tags a publish as latest, on registry.npmjs.org", () => {
    expect(publishArgs(false, {})).toEqual([
      "publish",
      "--access",
      "public",
      "--tag",
      "latest",
      "--registry",
      registry,
    ]);
  });

  it("appends --dry-run when requested", () => {
    expect(publishArgs(true, {})).toEqual([
      "publish",
      "--access",
      "public",
      "--tag",
      "latest",
      "--registry",
      registry,
      "--dry-run",
    ]);
  });

  it("appends --provenance under GitHub Actions", () => {
    expect(publishArgs(false, { GITHUB_ACTIONS: "true" })).toEqual([
      "publish",
      "--access",
      "public",
      "--tag",
      "latest",
      "--registry",
      registry,
      "--provenance",
    ]);
  });

  it("omits --provenance outside GitHub Actions", () => {
    expect(publishArgs(false, {})).not.toContain("--provenance");
  });

  it("always includes --registry pointing at registry.npmjs.org", () => {
    expect(publishArgs(false, {})).toContain(registry);
    expect(publishArgs(true, {})).toContain(registry);
    expect(publishArgs(false, { GITHUB_ACTIONS: "true" })).toContain(registry);
    expect(publishArgs(true, { GITHUB_ACTIONS: "true" })).toContain(registry);
  });
});
