import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkVersions,
  readSchemas,
  setVersions,
  versionSites,
} from "./schema-versions.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");

const info = read("schemas/info.schema.yaml");
const program = read("schemas/program.schema.yaml");
const stamp = read("schemas/data/stamp.schema.yaml");
const hex = read("schemas/data/hex.schema.yaml");

const lineAt = (text: string, index: number) =>
  text.slice(0, index).split("\n").length;

describe("versionSites", () => {
  it("finds the nested ethdebug block and ignores compiler versions", () => {
    expect(info).toMatch(/^\s+version: 0\.2\.3/m);
    const sites = versionSites(info);
    expect(sites).toHaveLength(1);
    expect(sites[0].path).toMatch(/^examples\/\d+\/ethdebug$/);
  });

  it("finds an example that is itself a stamp", () => {
    expect(versionSites(stamp).map((s) => s.path)).toEqual(["examples/0"]);
  });

  it("ignores the ethdebug property that declares the field", () => {
    expect(program).toMatch(/^properties:\n(.*\n)*? {2}ethdebug:/m);
    expect(versionSites(program).map((s) => s.path)).toEqual([
      "examples/0/ethdebug",
    ]);
  });

  it("reports the line and the range of the quoted scalar", () => {
    const [site] = versionSites(program);
    const [start, end] = site.range;
    expect(program.slice(start, end)).toBe(`"${site.version}"`);
    expect(site.line).toBe(lineAt(program, start));
  });
});

describe("setVersions", () => {
  it("sets the site and leaves everything else byte for byte", () => {
    const [start, end] = versionSites(program)[0].range;
    const after = setVersions(program, "0.1.0-draft.1");
    expect(after.slice(0, start)).toBe(program.slice(0, start));
    expect(after.slice(start, after.length - (program.length - end))).toBe(
      '"0.1.0-draft.1"',
    );
    expect(after.endsWith(program.slice(end))).toBe(true);
  });

  it("returns the text unchanged when there is no site", () => {
    expect(versionSites(hex)).toEqual([]);
    expect(setVersions(hex, "0.2.0")).toBe(hex);
  });
});

describe("checkVersions", () => {
  const path = "schemas/program.schema.yaml";
  const sites = versionSites(program);
  const file = { path, text: program, sites };

  it("names the file, the line and both versions when one differs", () => {
    const [problem] = checkVersions(file, "0.9.9");
    expect(problem).toContain(`${path}:${sites[0].line}`);
    expect(problem).toContain(sites[0].version);
    expect(problem).toContain("0.9.9");
  });
});

describe("the schemas in this repository", () => {
  const packageVersion = JSON.parse(read("packages/format/package.json"))
    .version as string;

  it("carry at least one version site", () => {
    const sites = readSchemas(root).flatMap((file) => file.sites);
    expect(sites.length).toBeGreaterThan(0);
  });

  it("name the version @ethdebug/format carries", () => {
    const problems = readSchemas(root).flatMap((file) =>
      checkVersions(file, packageVersion),
    );
    expect(problems).toEqual([]);
  });
});
