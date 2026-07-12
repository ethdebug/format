/**
 * The curated example set is sourced from `@ethdebug/bugc/examples`
 * (the canonical `.bug` files), sliced down and stripped for display.
 * These guards ensure the selection stays valid and editor-clean: the
 * strings ship verbatim into the docs playground editor.
 */
import { describe, it, expect } from "vitest";
import { compile } from "@ethdebug/bugc";
import { exampleSources } from "@ethdebug/bugc/examples";
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

  it("draws its sources from the canonical bugc examples", () => {
    // Sanity: the raw sources the curation selects really exist
    // upstream, so the selection can't silently drift to empty.
    expect(
      Object.prototype.hasOwnProperty.call(
        exampleSources,
        "intermediate/owner-counter.bug",
      ),
    ).toBe(true);
    expect(bugExamples.length).toBeGreaterThan(0);
  });

  it("strips bugc's inline test annotations for display", () => {
    for (const ex of bugExamples) {
      expect(ex.code).not.toContain("@test");
      expect(ex.code).not.toContain("@expect");
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
