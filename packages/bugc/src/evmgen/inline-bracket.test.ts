/**
 * Verifies that inlined virtual-activation invoke/return contexts are
 * BRACKETED on the emitted bytecode, not smeared across every op.
 *
 * An IR instruction lowers to N EVM micro-ops. evmgen must attach the
 * `invoke` discriminator to only the FIRST emitted op of the
 * invoke-bearing instruction and the `return` discriminator to only the
 * LAST emitted op of the return-bearing instruction, while keeping the
 * `transform: ["inline"]` membership marker on ALL body ops.
 *
 * Without bracketing, the tracer's push/pop reconstruction sees every
 * body op as both a push and a pop -> phantom frames.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;

type OptLevel = 0 | 1 | 2 | 3;

async function runtimeInstructions(source: string, level: OptLevel) {
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
  return result.value.bytecode.runtimeInstructions;
}

/** Flatten a context into leaves, unwrapping gather/pick. */
function leaves(ctx: Format.Program.Context): Format.Program.Context[] {
  if (Context.isGather(ctx)) return ctx.gather.flatMap(leaves);
  if ("pick" in ctx && Array.isArray((ctx as { pick: unknown[] }).pick)) {
    return (ctx as { pick: Format.Program.Context[] }).pick.flatMap(leaves);
  }
  return [ctx];
}

/** Per-op discriminator/marker presence, reaching nested pick/gather. */
function flags(instr: { debug?: { context?: Format.Program.Context } }) {
  const ctx = instr.debug?.context;
  if (!ctx) return { invoke: false, return: false, inline: false };
  const all = [ctx, ...leaves(ctx)];
  return {
    invoke: all.some((c) => Context.isInvoke(c)),
    return: all.some((c) => Context.isReturn(c)),
    inline: all.some(
      (c) => Context.isTransform(c) && c.transform.includes("inline"),
    ),
  };
}

function tally(instrs: ReturnType<typeof flags>[]) {
  let invoke = 0,
    ret = 0,
    both = 0,
    inline = 0;
  for (const f of instrs) {
    if (f.invoke) invoke += 1;
    if (f.return) ret += 1;
    if (f.invoke && f.return) both += 1;
    if (f.inline) inline += 1;
  }
  return { invoke, ret, both, inline };
}

// The exact fixture the UI reported mis-rendering: a leaf helper
// inlined at two sites.
const dblTwoSites = `name Multi;
define { function dbl(x: uint256) -> uint256 { return x + x; }; }
storage { [0] r: uint256; }
create { r = 0; }
code {
  let a = dbl(5);
  let b = dbl(10);
  r = a + b;
}`;

// A multi-instruction body: entry (t = x + x) differs from exit
// (t * x), so invoke and return live on distinct IR instructions.
const multiInstrBody = `name Poly;
define { function poly(x: uint256) -> uint256 { let t = x + x; return t * x; }; }
storage { [0] a: uint256; [1] r: uint256; }
create { a = 3; r = 0; }
code { r = poly(a); }`;

describe("inlined invoke/return are bracketed on emitted bytecode", () => {
  it("dbl@2-sites: one push and one pop per site, never both on an op", async () => {
    const instrs = await runtimeInstructions(dblTwoSites, 2);
    const t = tally(instrs.map(flags));
    // Two inlined sites => exactly one invoke op and one return op each.
    expect(t.invoke).toBe(2);
    expect(t.ret).toBe(2);
    // No op may be both a push and a pop (that breaks push/pop).
    expect(t.both).toBe(0);
    // Membership marker stays on every body op (more than the 4
    // boundary ops).
    expect(t.inline).toBeGreaterThan(4);
  });

  it("dbl@2-sites: each site's invoke op precedes its return op", async () => {
    const instrs = await runtimeInstructions(dblTwoSites, 2);
    const seq = instrs
      .map((instr, i) => ({ i, f: flags(instr) }))
      .filter(({ f }) => f.invoke || f.return)
      .map(({ f }) => (f.invoke ? "invoke" : "return"));
    // Bracketed order across two sites: push,pop,push,pop.
    expect(seq).toEqual(["invoke", "return", "invoke", "return"]);
  });

  it("multi-instruction body: invoke on entry, return on exit, both=0", async () => {
    const instrs = await runtimeInstructions(multiInstrBody, 2);
    const t = tally(instrs.map(flags));
    expect(t.invoke).toBe(1);
    expect(t.ret).toBe(1);
    expect(t.both).toBe(0);
  });

  it("preserves runtime behavior at every level", async () => {
    for (const level of [0, 1, 2, 3] as const) {
      const res = await executeProgram(dblTwoSites, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(res.callSuccess).toBe(true);
      // dbl(5)=10, dbl(10)=20, r=30
      expect(await res.getStorage(0n)).toBe(30n);
    }
  });
});

// A self-tail-recursive accumulator: TCO turns the recursive call
// into a single back-edge JUMP that legitimately carries BOTH invoke
// and return on its one op (end one iteration + begin the next).
const tailRecursive = `name TailSum;
define {
  function sum(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; }
    else { return sum(n - 1, acc + n); }
  };
}
storage { [0] result: uint256; }
create { result = 0; }
code { result = sum(5, 0); }`;

// Mutually recursive functions never inline, so their calls stay real
// (invoke on a 1-op JUMP, return on a 1-op JUMPDEST).
const mutualRecursion = `name EvenOdd;
define {
  function isEven(n: uint256) -> uint256 {
    if (n == 0) { return 1; } else { return isOdd(n - 1); }
  };
  function isOdd(n: uint256) -> uint256 {
    if (n == 0) { return 0; } else { return isEven(n - 1); }
  };
}
storage { [0] result: uint256; }
create { result = 0; }
code { result = isEven(4); }`;

describe("bracketing is a no-op for single-op invoke/return carriers", () => {
  it("tailcall back-edge keeps its combined invoke+return on one op", async () => {
    // The back-edge JUMP is a single op carrying both markers; bracketing
    // to first-op/last-op is first==last, so both must survive.
    const instrs = await runtimeInstructions(tailRecursive, 2);
    const t = tally(instrs.map(flags));
    expect(t.both).toBeGreaterThanOrEqual(1);
  });

  it("real (non-inlined) calls never carry both on an op", async () => {
    const instrs = await runtimeInstructions(mutualRecursion, 2);
    const t = tally(instrs.map(flags));
    // Real calls put invoke on a 1-op JUMP and return on a 1-op JUMPDEST,
    // distinct ops — the fix must not fabricate a both.
    expect(t.both).toBe(0);
    expect(t.invoke).toBeGreaterThan(0);
    expect(t.ret).toBeGreaterThan(0);
  });
});
