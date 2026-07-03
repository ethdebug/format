/**
 * The curated example set must stay small, clean, and — above all —
 * compilable: these strings are shipped verbatim into the docs
 * playground editor, so a typo would surface as a broken example.
 */
import { describe, it, expect } from "vitest";
import { compile } from "@ethdebug/bugc";
import { bugExamples } from "./examples.js";

describe("bugExamples", () => {
  it("is the curated trio (counter, functions, arrays)", () => {
    expect(bugExamples.map((e) => e.name)).toEqual([
      "counter",
      "functions",
      "arrays",
    ]);
  });

  it("gives every example a display name and non-empty source", () => {
    for (const ex of bugExamples) {
      expect(ex.displayName.trim().length).toBeGreaterThan(0);
      expect(ex.code.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries no leftover @test annotation blocks", () => {
    for (const ex of bugExamples) {
      expect(ex.code).not.toContain("@test");
    }
  });

  // Each curated source must compile cleanly to bytecode — this is
  // the guard that matters, since these ship straight to the editor.
  for (const ex of bugExamples) {
    it(`compiles ${ex.name} to bytecode without errors`, async () => {
      const result = await compile({
        to: "bytecode",
        source: ex.code,
        optimizer: { level: 0 },
      });
      expect(result.success).toBe(true);
    });
  }
});
