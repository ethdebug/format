import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { version } from "#version";

const schemasRoot = fileURLToPath(
  new URL("../../../../schemas/", import.meta.url),
);

function* yamlFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* yamlFiles(path);
    else if (entry.endsWith(".schema.yaml")) yield path;
  }
}

describe("version literals in schema examples", () => {
  it("every ethdebug.version equals this package's version", () => {
    const wrong: string[] = [];
    let sites = 0;
    for (const file of yamlFiles(schemasRoot)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const match = /^\s*version:\s*"([^"]*)"\s*$/.exec(line);
        if (!match) return;
        const previous = lines.slice(Math.max(0, i - 2), i).join("\n");
        const inBlock =
          /ethdebug:\s*$/.test(previous) ||
          /schema:\s*"schema:ethdebug\/format\//.test(previous);
        if (!inBlock) return;
        sites += 1;
        if (match[1] !== version) wrong.push(`${file}:${i + 1}: ${match[1]}`);
      });
    }
    expect(sites).toBeGreaterThanOrEqual(4);
    expect(wrong).toEqual([]);
  });
});
