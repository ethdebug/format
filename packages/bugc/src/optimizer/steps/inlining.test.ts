/**
 * Behavioral tests for the function-inlining pass (level 2).
 *
 * Inlining must (a) preserve runtime behavior exactly, and
 * (b) emit `transform: ["inline"]` on the inlined body so the
 * debugger can reconstruct a virtual activation for the call.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;

function leaves(ctx: Format.Program.Context): Format.Program.Context[] {
  if (Context.isGather(ctx)) return ctx.gather.flatMap(leaves);
  if ("pick" in ctx && Array.isArray((ctx as { pick: unknown[] }).pick)) {
    return (ctx as { pick: Format.Program.Context[] }).pick.flatMap(leaves);
  }
  return [ctx];
}

async function inlineMarks(source: string, level: 0 | 1 | 2 | 3) {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });
  if (!result.success) {
    const errors = result.messages.error ?? [];
    throw new Error(
      "compile failed:\n" +
        errors
          .map((e: { message?: string }) => e.message ?? String(e))
          .join("\n"),
    );
  }
  let count = 0;
  for (const instr of result.value.bytecode.runtimeInstructions) {
    const ctx = instr.debug?.context;
    if (!ctx) continue;
    if (
      [ctx, ...leaves(ctx)].some(
        (c) => Context.isTransform(c) && c.transform.includes("inline"),
      )
    ) {
      count += 1;
    }
  }
  return count;
}

describe("function inlining (level 2)", () => {
  describe("leaf helper, single return", () => {
    const source = `name Demo;
define {
  function add(a: uint256, b: uint256) -> uint256 { return a + b; };
}
storage { [0] r: uint256; }
create {}
code { r = add(3, 4); }`;

    it("produces the same result at every level", async () => {
      for (const level of [0, 1, 2, 3] as const) {
        const res = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(res.callSuccess).toBe(true);
        expect(await res.getStorage(0n)).toBe(7n);
      }
    });

    it("emits no inline marks at level 0", async () => {
      expect(await inlineMarks(source, 0)).toBe(0);
    });

    it("emits inline marks at level 2", async () => {
      expect(await inlineMarks(source, 2)).toBeGreaterThan(0);
    });
  });

  describe("multiple call sites", () => {
    const source = `name Multi;
define {
  function dbl(x: uint256) -> uint256 { return x + x; };
}
storage { [0] r: uint256; }
create { r = 0; }
code {
  let a = dbl(5);
  let b = dbl(10);
  r = a + b;
}`;

    it("inlines every site and stays correct", async () => {
      for (const level of [0, 1, 2, 3] as const) {
        const res = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(res.callSuccess).toBe(true);
        expect(await res.getStorage(0n)).toBe(30n);
      }
      expect(await inlineMarks(source, 2)).toBeGreaterThan(0);
    });
  });

  describe("does not inline into a tail-recursive function (protects TCO)", () => {
    // `succ` is a leaf, but inlining it into `count`'s recursive
    // call arguments would rewrite `count(succ(n))` into
    // `count(n + 1)`, which the tail-call optimizer mishandles.
    // The pass must leave recursive/TCO'd callers untouched.
    const source = `name TailCall;
define {
  function succ(n: uint256) -> uint256 { return n + 1; };
  function count(n: uint256, target: uint256) -> uint256 {
    if (n < target) { return count(succ(n), target); }
    else { return n; }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = count(0, 5); }`;

    it("stays correct at every level", async () => {
      for (const level of [0, 1, 2, 3] as const) {
        const res = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(res.callSuccess).toBe(true);
        expect(await res.getStorage(0n)).toBe(5n);
      }
    });

    it("does not inline succ into the recursive count", async () => {
      // No inline markers: succ stays a real call so TCO can fire.
      expect(await inlineMarks(source, 2)).toBe(0);
    });
  });
});
