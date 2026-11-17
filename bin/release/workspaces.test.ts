import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readWorkspaces, topoSort, type Workspace } from "./workspaces.js";

const ws = (name: string, over: Partial<Workspace> = {}): Workspace => ({
  name,
  version: "0.1.0-preview.0",
  dir: `/repo/packages/${name.replace("@ethdebug/", "")}`,
  private: false,
  text: "{}",
  json: {},
  runtime: [],
  peer: [],
  dev: [],
  optional: [],
  dependencies: [],
  all: [],
  ...over,
});

describe("readWorkspaces", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  function fixture(manifests: Record<string, unknown>): Workspace[] {
    root = mkdtempSync(join(tmpdir(), "ws-"));
    for (const [dir, manifest] of Object.entries(manifests)) {
      mkdirSync(join(root, "packages", dir), { recursive: true });
      writeFileSync(
        join(root, "packages", dir, "package.json"),
        JSON.stringify(manifest),
      );
    }
    writeFileSync(join(root, "packages", ".DS_Store"), "");
    return readWorkspaces(root);
  }

  it("derives `dependencies` as runtime + peer, first one winning", () => {
    const [w] = fixture({
      a: {
        name: "@ethdebug/a",
        version: "1.0.0",
        dependencies: {
          "@ethdebug/c": "^1",
          lodash: "^4",
          "@ethdebug/b": "^1",
        },
        peerDependencies: { "@ethdebug/b": "^1", "@ethdebug/d": "^1" },
        devDependencies: { "@ethdebug/e": "^1" },
      },
    });
    expect(w.runtime).toEqual(["@ethdebug/c", "@ethdebug/b"]);
    expect(w.peer).toEqual(["@ethdebug/b", "@ethdebug/d"]);
    expect(w.dev).toEqual(["@ethdebug/e"]);
    expect(w.dependencies).toEqual([
      "@ethdebug/c",
      "@ethdebug/b",
      "@ethdebug/d",
    ]);
  });

  it("derives `all` from the four kinds in order, deduplicated", () => {
    const [w] = fixture({
      a: {
        name: "@ethdebug/a",
        version: "1.0.0",
        // key order in the manifest must not matter; kind order does
        optionalDependencies: { "@ethdebug/o": "^1", "@ethdebug/r": "^1" },
        peerDependencies: { "@ethdebug/p": "^1", "@ethdebug/d": "^1" },
        devDependencies: { "@ethdebug/d": "^1", "@ethdebug/v": "^1" },
        dependencies: { "@ethdebug/r": "^1", other: "^1" },
      },
    });
    expect(w.optional).toEqual(["@ethdebug/o", "@ethdebug/r"]);
    expect(w.all).toEqual([
      "@ethdebug/r",
      "@ethdebug/d",
      "@ethdebug/v",
      "@ethdebug/p",
      "@ethdebug/o",
    ]);
  });

  it("reads private, text, version and dir, and skips non-packages", () => {
    const workspaces = fixture({
      a: { name: "@ethdebug/a", version: "1.0.0" },
      b: { name: "@ethdebug/b", version: "2.0.0", private: true },
    });
    expect(workspaces).toHaveLength(2);
    const byName = new Map(workspaces.map((w) => [w.name, w]));
    const a = byName.get("@ethdebug/a")!;
    const b = byName.get("@ethdebug/b")!;
    expect(a.private).toBe(false);
    expect(b.private).toBe(true);
    expect(b.version).toBe("2.0.0");
    expect(a.text).toBe(
      JSON.stringify({ name: "@ethdebug/a", version: "1.0.0" }),
    );
    expect(a.json.name).toBe("@ethdebug/a");
    expect(a.dir.endsWith(join("packages", "a"))).toBe(true);
    expect(a.dependencies).toEqual([]);
    expect(a.all).toEqual([]);
  });

  it("merges dependencies and peerDependencies, filtered", () => {
    const workspaces = fixture({
      a: { name: "@ethdebug/a", version: "1.0.0" },
      b: {
        name: "@ethdebug/b",
        version: "1.0.0",
        dependencies: { "@ethdebug/a": "^1.0.0", lodash: "^4" },
        peerDependencies: { "@ethdebug/c": "^1.0.0" },
      },
      c: { name: "@ethdebug/c", version: "1.0.0", private: true },
    });
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

describe("topoSort", () => {
  it("puts a dependency before its dependent", () => {
    const a = ws("@ethdebug/a", { dependencies: ["@ethdebug/b"] });
    const b = ws("@ethdebug/b");
    expect(topoSort([a, b]).map((w) => w.name)).toEqual([
      "@ethdebug/b",
      "@ethdebug/a",
    ]);
  });

  it("orders dependencies before dependents, including peers", () => {
    const sorted = topoSort([
      ws("@ethdebug/evm", { dependencies: ["@ethdebug/pointers"] }),
      ws("@ethdebug/pointers", { dependencies: ["@ethdebug/format"] }),
      ws("@ethdebug/format"),
    ]).map((w) => w.name);
    expect(sorted).toEqual([
      "@ethdebug/format",
      "@ethdebug/pointers",
      "@ethdebug/evm",
    ]);
  });

  it("throws on a cycle", () => {
    const a = ws("@ethdebug/a", { dependencies: ["@ethdebug/b"] });
    const b = ws("@ethdebug/b", { dependencies: ["@ethdebug/a"] });
    expect(() => topoSort([a, b])).toThrow(/dependency cycle/);
  });
});
