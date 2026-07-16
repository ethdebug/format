/**
 * Inlining preserves the call site's source range.
 *
 * When a call is inlined, the real call instruction (which mapped to
 * the call expression, e.g. `square(a)`) is gone and the entry jump
 * that carried its range is folded by jump-optimization. Without care
 * the call site maps to no instruction. The pass gathers the call-site
 * range onto the entry inlined instruction alongside the callee-body
 * range it collides with, so the call expression stays mapped.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";

// A storage-read argument keeps the inlined body from being folded
// away at O3, so the inline markers survive.
const source = `name Inline;
define {
  function square(x: uint256) -> uint256 { return x * x; };
}
storage { [0] r: uint256; [1] a: uint256; }
create { a = 3; }
code { r = square(a); }`;

async function runtimeProgram(level: 0 | 2 | 3): Promise<Format.Program> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });
  if (!result.success) throw new Error("compile failed");
  return result.value.bytecode.runtimeProgram;
}

/** All `code` leaves reachable through gather/pick, recursively. */
function codeLeaves(ctx: unknown): Array<{ offset: number; length: number }> {
  if (!ctx || typeof ctx !== "object") return [];
  const c = ctx as Record<string, unknown>;
  if (Array.isArray(c.gather)) return c.gather.flatMap(codeLeaves);
  if (Array.isArray(c.pick)) return c.pick.flatMap(codeLeaves);
  if (c.code && typeof c.code === "object") {
    const range = (c.code as { range?: { offset: number; length: number } })
      .range;
    return range ? [range] : [];
  }
  return [];
}

/** True if an invoke discriminator is present at any leaf. */
function carriesInvoke(ctx: unknown): boolean {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Record<string, unknown>;
  if (Array.isArray(c.gather)) return c.gather.some(carriesInvoke);
  if (Array.isArray(c.pick)) return c.pick.some(carriesInvoke);
  return "invoke" in c;
}

describe("inlining preserves the call-site source range", () => {
  for (const level of [2, 3] as const) {
    it(`gathers call-site + callee-body ranges on the inlined instruction at O${level}`, async () => {
      const program = await runtimeProgram(level);

      // The virtual invoke marks the inlined activation; that
      // instruction should now carry two distinct code ranges.
      const inlined = program.instructions.filter(
        (i) => i.context && carriesInvoke(i.context),
      );
      expect(inlined.length).toBeGreaterThan(0);

      const withTwoRanges = inlined.find((i) => {
        const ranges = codeLeaves(i.context);
        const distinct = new Set(ranges.map((r) => `${r.offset}:${r.length}`));
        return distinct.size >= 2;
      });
      expect(
        withTwoRanges,
        "an inlined instruction carrying both the call-site and callee-body ranges",
      ).toBeDefined();

      // One of the ranges must be the call expression `square(a)`.
      const callSite = source.indexOf("square(a)");
      const ranges = codeLeaves(withTwoRanges!.context);
      expect(ranges.some((r) => r.offset === callSite)).toBe(true);
    });
  }

  it("does not inline (and needs no gather) at O0", async () => {
    const program = await runtimeProgram(0);
    const inlined = program.instructions.filter(
      (i) =>
        i.context &&
        carriesInvoke(i.context) &&
        i.operation?.mnemonic !== "JUMP" &&
        i.operation?.mnemonic !== "JUMPDEST",
    );
    // At O0 the invoke rides real call JUMP/JUMPDESTs, not spliced
    // body instructions — so no non-jump instruction carries it.
    expect(inlined.length).toBe(0);
  });

  it("keeps runtime behavior correct at every level", async () => {
    for (const level of [0, 2, 3] as const) {
      const res = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(res.callSuccess).toBe(true);
      expect(await res.getStorage(0n)).toBe(9n); // square(3) = 9
    }
  });
});
