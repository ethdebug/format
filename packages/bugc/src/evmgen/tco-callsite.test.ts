/**
 * Tail-call optimization preserves the call site's source range.
 *
 * TCO (level 2+) rewrites a tail-recursive call into a back-edge JUMP
 * that carries a flat `{return, invoke, transform: ["tailcall"]}`
 * context. Without the call-site range, that JUMP maps only to the
 * callee declaration, not the recursive call expression the user
 * wrote. This carries the call site's `code` range flat alongside the
 * invoke/return (disjoint keys) — matching the `{invoke, code}` a real
 * caller JUMP gets and the `{return, code}` on a non-TCO continuation
 * JUMPDEST.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import { Program } from "@ethdebug/format";
import type * as Format from "@ethdebug/format";

const { Context } = Program;

const source = `name TailSum;
define {
  function sum(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; }
    else { return sum(n - 1, acc + n); }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = sum(5, 0); }`;

async function runtimeProgram(level: 2 | 3): Promise<Format.Program> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });
  if (!result.success) throw new Error("compile failed");
  return result.value.bytecode.runtimeProgram;
}

/** Flatten a context into leaves, unwrapping gather/pick. */
function leaves(ctx: Format.Program.Context): Format.Program.Context[] {
  if (Context.isGather(ctx)) return ctx.gather.flatMap(leaves);
  if ("pick" in ctx && Array.isArray((ctx as { pick: unknown[] }).pick)) {
    return (ctx as { pick: Format.Program.Context[] }).pick.flatMap(leaves);
  }
  return [ctx];
}

function hasCodeRange(ctx: Format.Program.Context): boolean {
  return [ctx, ...leaves(ctx)].some((c) => {
    const code = (c as { code?: { range?: { offset?: unknown } } }).code;
    return !!code && typeof code.range?.offset === "number";
  });
}

/** Find the TCO back-edge JUMP: a JUMP tagged transform ["tailcall"]. */
function tailCallJump(program: Format.Program) {
  return program.instructions.find(
    (i) =>
      i.operation?.mnemonic === "JUMP" &&
      i.context !== undefined &&
      [i.context, ...leaves(i.context)].some(
        (c) => Context.isTransform(c) && c.transform.includes("tailcall"),
      ),
  );
}

describe("call-site source range on the TCO back-edge JUMP", () => {
  for (const level of [2, 3] as const) {
    it(`the back-edge JUMP carries a call-site code range (level ${level})`, async () => {
      const program = await runtimeProgram(level);
      const jump = tailCallJump(program);
      expect(jump, "tailcall JUMP").toBeDefined();
      expect(hasCodeRange(jump!.context!)).toBe(true);
    });

    it(`the back-edge JUMP still carries invoke and return identity (level ${level})`, async () => {
      const program = await runtimeProgram(level);
      const jump = tailCallJump(program);
      const parts = [jump!.context!, ...leaves(jump!.context!)];
      expect(parts.some((c) => Context.isInvoke(c))).toBe(true);
      expect(parts.some((c) => Context.isReturn(c))).toBe(true);
    });

    it(`preserves behavior vs unoptimized (level ${level})`, async () => {
      const base = await executeProgram(source, {
        calldata: "",
        optimizationLevel: 0,
      });
      const opt = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(base.callSuccess).toBe(true);
      expect(opt.callSuccess).toBe(true);
      // TCO must not change the computed result.
      expect(await opt.getStorage(0n)).toBe(await base.getStorage(0n));
    });
  }
});
