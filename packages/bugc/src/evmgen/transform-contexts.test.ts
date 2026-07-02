/**
 * Verifies that optimizer `transform` markers are emitted onto
 * the resulting bytecode's debug contexts, on the same
 * `runtimeInstructions` path the docs tracer widget consumes.
 *
 * Level 1 constant folding attaches `transform: ["fold"]` to the
 * folded value's instruction; a debugger can then show that a
 * PUSH is a compile-time-evaluated constant rather than source
 * the user wrote.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;

type OptLevel = 0 | 1 | 2 | 3;

async function compileBytecode(source: string, level: OptLevel) {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });
  if (!result.success) {
    const errors = result.messages.error ?? [];
    throw new Error(
      `Compilation failed at level ${level}:\n` +
        errors
          .map((e: { message?: string }) => e.message ?? String(e))
          .join("\n"),
    );
  }
  return result.value.bytecode;
}

/** Flatten a context into leaves, unwrapping gather/pick. */
function leaves(ctx: Format.Program.Context): Format.Program.Context[] {
  if (Context.isGather(ctx)) return ctx.gather.flatMap(leaves);
  if ("pick" in ctx && Array.isArray((ctx as { pick: unknown[] }).pick)) {
    return (ctx as { pick: Format.Program.Context[] }).pick.flatMap(leaves);
  }
  return [ctx];
}

/**
 * Count instructions in the widget-path array whose context
 * (at top level or in any leaf) carries a transform containing
 * the given identifier.
 */
function countTransform(
  instructions: { debug?: { context?: Format.Program.Context } }[],
  id: string,
): number {
  let count = 0;
  for (const instr of instructions) {
    const ctx = instr.debug?.context;
    if (!ctx) continue;
    const hit = [ctx, ...leaves(ctx)].some(
      (c) => Context.isTransform(c) && c.transform.includes(id),
    );
    if (hit) count += 1;
  }
  return count;
}

describe("optimizer emits fold transform contexts", () => {
  // `2 + 3` and `4 * 5` fold to constants at level 1.
  const source = `name Fold;

storage { [0] r: uint256; }
create { r = 0; }
code { r = (2 + 3) * (4 * 5); }`;

  it("emits no fold transform at level 0", async () => {
    const bc = await compileBytecode(source, 0);
    expect(countTransform(bc.runtimeInstructions, "fold")).toBe(0);
  });

  for (const level of [1, 2, 3] as const) {
    it(`emits fold transform at level ${level}`, async () => {
      const bc = await compileBytecode(source, level);
      expect(countTransform(bc.runtimeInstructions, "fold")).toBeGreaterThan(0);
    });
  }
});
