/**
 * These tests guard the example subpath export: that the generated source
 * map is populated, and — crucially — that stripping the test annotations
 * is purely cosmetic. Because the strip only removes comments, a stripped
 * example must compile to byte-identical bytecode as its raw counterpart;
 * if it doesn't, the strip has eaten real code.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { exampleSources, examplePaths, stripTestAnnotations } from "./index.js";

// A representative set of examples that compile cleanly. Kept small so the
// test stays fast; the point is to exercise strip/compile equivalence, not
// to re-test the whole example corpus (test/examples covers that).
const COMPILABLE = [
  "basic/minimal.bug",
  "basic/functions.bug",
  "basic/conditionals.bug",
  "basic/array-length.bug",
  "intermediate/arrays.bug",
  "intermediate/mappings.bug",
];

const hex = (bytes?: Uint8Array): string =>
  bytes ? Buffer.from(bytes).toString("hex") : "";

describe("example sources", () => {
  it("surfaces the canonical .bug files keyed by relative path", () => {
    expect(examplePaths.length).toBeGreaterThan(0);
    expect(examplePaths).toEqual(Object.keys(exampleSources));
    expect(exampleSources["basic/minimal.bug"]).toContain("name Minimal;");
  });

  it("keeps the raw sources' test annotations intact", () => {
    // The raw map is the test fixtures verbatim — annotations included.
    const anyHasTestBlock = examplePaths.some((p) =>
      exampleSources[p].includes("@test"),
    );
    expect(anyHasTestBlock).toBe(true);
  });
});

describe("stripTestAnnotations on real examples", () => {
  for (const path of COMPILABLE) {
    it(`yields annotation-free source for ${path}`, () => {
      const clean = stripTestAnnotations(exampleSources[path]);
      expect(clean).not.toContain("@test");
      expect(clean).not.toMatch(/\/\/\s*@(?:wip|skip|expect-)/);
    });

    it(`compiles ${path} to the same bytecode raw and stripped`, async () => {
      const raw = exampleSources[path];
      const clean = stripTestAnnotations(raw);

      const rawResult = await compile({
        to: "bytecode",
        source: raw,
        optimizer: { level: 0 },
      });
      const cleanResult = await compile({
        to: "bytecode",
        source: clean,
        optimizer: { level: 0 },
      });

      expect(rawResult.success).toBe(true);
      expect(cleanResult.success).toBe(true);
      if (!rawResult.success || !cleanResult.success) return;

      expect(hex(cleanResult.value.bytecode.runtime)).toBe(
        hex(rawResult.value.bytecode.runtime),
      );
      expect(hex(cleanResult.value.bytecode.create)).toBe(
        hex(rawResult.value.bytecode.create),
      );
    });
  }
});
