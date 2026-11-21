import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApplyFailure, applyRelease, undoAdvice } from "./apply.js";
import type { Move, Plan } from "./plan.js";

const dirs: string[] = [];

// git hooks and `rebase --exec` export GIT_DIR and friends; git in the
// temp repos would then act on the real repository, so clear them
const saved: Record<string, string> = {};

beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) {
      saved[key] = process.env[key] as string;
      delete process.env[key];
    }
  }
});

afterAll(() => {
  Object.assign(process.env, saved);
});

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

// a real repository holding one committed file per name
function repo(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "apply-"));
  dirs.push(dir);
  git(dir, "init", "--quiet");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  for (const file of files) {
    writeFileSync(join(dir, file), "{}\n");
  }
  git(dir, "add", ...files);
  git(dir, "commit", "--quiet", "-m", "first");
  return dir;
}

function move(name: string, to: string): Move {
  return { name, from: "0.1.0", to, reason: "changed", firstRelease: false };
}

describe("applyRelease", () => {
  it("writes the files, commits Publish and creates the tags", () => {
    const dir = repo(["a.json"]);
    const plan: Plan = {
      moves: [move("@ethdebug/a", "0.2.0")],
      manifests: [{ path: "a.json", text: '{"version":"0.2.0"}\n' }],
      schemas: [],
    };

    const applied = applyRelease(dir, plan);

    expect(readFileSync(join(dir, "a.json"), "utf8")).toContain("0.2.0");
    expect(applied.written).toEqual(["a.json"]);
    expect(applied.committed).toBe(true);
    expect(applied.created).toEqual(["@ethdebug/a@0.2.0"]);
    expect(git(dir, "log", "-1", "--format=%s")).toBe("Publish");
  });

  it("tags HEAD without committing on a first-release-only plan", () => {
    const dir = repo(["a.json"]);
    const head = git(dir, "rev-parse", "HEAD");
    const plan: Plan = {
      moves: [{ ...move("@ethdebug/a", "0.1.0"), firstRelease: true }],
      manifests: [],
      schemas: [],
    };

    const applied = applyRelease(dir, plan);

    expect(applied.committed).toBe(false);
    expect(applied.created).toEqual(["@ethdebug/a@0.1.0"]);
    expect(git(dir, "tag", "--points-at", "HEAD")).toBe("@ethdebug/a@0.1.0");
    expect(git(dir, "rev-parse", "HEAD")).toBe(head);
    expect(git(dir, "rev-list", "--count", "HEAD")).toBe("1");
  });

  it("reports the tags it created when tagging fails part-way", () => {
    const dir = repo(["a.json", "b.json"]);
    const plan: Plan = {
      moves: [move("@ethdebug/a", "0.2.0"), move("@ethdebug/b", "0.2.0")],
      manifests: [
        { path: "a.json", text: '{"version":"0.2.0"}\n' },
        { path: "b.json", text: '{"version":"0.2.0"}\n' },
      ],
      schemas: [],
    };
    // the second tag exists, so `git tag -a` throws on the second turn
    git(dir, "tag", "-a", "@ethdebug/b@0.2.0", "-m", "x");

    let failure: unknown;
    try {
      applyRelease(dir, plan);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ApplyFailure);
    const error = failure as ApplyFailure;
    expect(error.created).toEqual(["@ethdebug/a@0.2.0"]);
    expect(error.committed).toBe(true);
    const advice = undoAdvice(error.created, error.committed);
    expect(advice).toContain("git tag -d @ethdebug/a@0.2.0");
    expect(advice).toContain("git reset --hard HEAD~1");
  });
});

describe("undoAdvice", () => {
  it("removes the tags and the commit when this run committed", () => {
    expect(undoAdvice(["@ethdebug/evm@1.0.0"], true)).toBe(
      "undo: git tag -d @ethdebug/evm@1.0.0 && git reset --hard HEAD~1",
    );
  });

  it("removes the commit alone when it failed before any tag", () => {
    expect(undoAdvice([], true)).toBe("undo: git reset --hard HEAD~1");
  });

  // a first-release-only plan tags HEAD without committing
  it("removes the tags alone when no commit was made", () => {
    expect(
      undoAdvice(["@ethdebug/evm@1.0.0", "@ethdebug/bugc@1.0.0"], false),
    ).toBe("undo: git tag -d @ethdebug/evm@1.0.0 @ethdebug/bugc@1.0.0");
  });

  it("restores the manifests when nothing was committed or tagged", () => {
    expect(undoAdvice([], false)).toBe(
      "undo: git checkout HEAD -- packages/*/package.json schemas/",
    );
  });
});
