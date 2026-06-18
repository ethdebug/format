/**
 * Verifies that invoke/return debug contexts survive
 * optimizer transformations at every optimization level.
 *
 * Covers every pass that could touch call sites or return
 * paths:
 *   Level 1: constant folding, propagation, DCE
 *   Level 2: CSE, TCO, jump optimization
 *   Level 3: block merging, return merging, R/W merging
 *
 * Each test compiles the same source at multiple levels,
 * asserts the resulting bytecode still runs correctly, and
 * verifies the expected invoke/return contexts are present
 * with the right identifiers. TCO is a special case: the
 * back-edge JUMP that replaces the recursive call carries a
 * single flat context with BOTH the previous iteration's
 * return and the new iteration's invoke discriminators, so
 * frame depth stays constant across the optimization.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;
const { Invocation } = Context.Invoke;

type OptLevel = 0 | 1 | 2 | 3;

/**
 * Compile source at the given optimization level and
 * return the runtime program.
 */
async function compileAt(
  source: string,
  level: OptLevel,
): Promise<Format.Program> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level },
  });

  if (!result.success) {
    const errors = result.messages.error ?? [];
    const msgs = errors
      .map((e: { message?: string }) => e.message ?? String(e))
      .join("\n");
    throw new Error(`Compilation failed at level ${level}:\n${msgs}`);
  }

  return result.value.bytecode.runtimeProgram;
}

interface CallSiteCounts {
  /** Caller JUMP with invoke context, keyed by identifier. */
  invokeJump: Record<string, number>;
  /** Callee entry JUMPDEST with invoke context. */
  invokeJumpdest: Record<string, number>;
  /** Continuation JUMPDEST with return context. */
  returnJumpdest: Record<string, number>;
  /**
   * JUMP carrying a return context (TCO back-edge, where
   * the previous iteration's return is paired with the new
   * iteration's invoke on a single flat context).
   */
  returnJump: Record<string, number>;
}

/**
 * Flatten a context into its direct invoke/return leaves,
 * unwrapping any enclosing gather.
 */
function unwrapLeaves(ctx: Format.Program.Context): Format.Program.Context[] {
  if (Context.isGather(ctx)) {
    return ctx.gather.flatMap(unwrapLeaves);
  }
  return [ctx];
}

/**
 * Scan a program and count invoke/return contexts by
 * instruction type and function identifier. Each leaf is
 * checked for invoke and return independently (not as an
 * either/or) so a flat multi-discriminator context — like
 * the TCO back-edge JUMP carrying both `invoke` and
 * `return` — gets counted in both buckets. Enclosing
 * gather wrappers are still unwrapped for defensive
 * coverage.
 */
function countCallSites(program: Format.Program): CallSiteCounts {
  const counts: CallSiteCounts = {
    invokeJump: {},
    invokeJumpdest: {},
    returnJumpdest: {},
    returnJump: {},
  };

  for (const instr of program.instructions) {
    const ctx = instr.context;
    if (!ctx) continue;

    const mn = instr.operation?.mnemonic;

    for (const leaf of unwrapLeaves(ctx)) {
      if (Context.isInvoke(leaf)) {
        const id = leaf.invoke.identifier ?? "?";
        if (mn === "JUMP") {
          counts.invokeJump[id] = (counts.invokeJump[id] ?? 0) + 1;
        } else if (mn === "JUMPDEST") {
          counts.invokeJumpdest[id] = (counts.invokeJumpdest[id] ?? 0) + 1;
        }
      }
      if (Context.isReturn(leaf)) {
        const id = leaf.return.identifier ?? "?";
        if (mn === "JUMPDEST") {
          counts.returnJumpdest[id] = (counts.returnJumpdest[id] ?? 0) + 1;
        } else if (mn === "JUMP") {
          counts.returnJump[id] = (counts.returnJump[id] ?? 0) + 1;
        }
      }
    }
  }

  return counts;
}

describe("optimizer preserves invoke/return contexts", () => {
  const allLevels: OptLevel[] = [0, 1, 2, 3];

  describe("simple non-recursive call", () => {
    const source = `name Simple;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = add(10, 20); }`;

    for (const level of allLevels) {
      it(`preserves contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        // One caller JUMP, one callee JUMPDEST, one
        // continuation JUMPDEST — all naming "add".
        expect(counts.invokeJump).toEqual({ add: 1 });
        expect(counts.invokeJumpdest).toEqual({ add: 1 });
        expect(counts.returnJumpdest).toEqual({ add: 1 });

        // Behavior is still correct.
        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(30n);
      });
    }
  });

  describe("constant-foldable arguments", () => {
    // Exercises constant folding (level 1+): args reduce
    // to constants but the call itself must remain.
    const source = `name ConstFold;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = add(2 + 3, 4 * 5); }`;

    for (const level of allLevels) {
      it(`preserves call contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        expect(counts.invokeJump).toEqual({ add: 1 });
        expect(counts.invokeJumpdest).toEqual({ add: 1 });
        expect(counts.returnJumpdest).toEqual({ add: 1 });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(25n);
      });
    }
  });

  describe("multiple call sites to same function", () => {
    // Exercises CSE (level 2+): dbl(5) and dbl(10) share
    // no subexpressions, but verifies that CSE over the
    // call setup itself doesn't collapse distinct calls.
    const source = `name MultiCall;

define {
  function dbl(x: uint256) -> uint256 {
    return x + x;
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code {
  let a = dbl(5);
  let b = dbl(10);
  r = a + b;
}`;

    for (const level of allLevels) {
      it(`keeps both call sites at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        expect(counts.invokeJump).toEqual({ dbl: 2 });
        expect(counts.invokeJumpdest).toEqual({ dbl: 1 });
        expect(counts.returnJumpdest).toEqual({ dbl: 2 });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        // dbl(5) + dbl(10) = 10 + 20 = 30
        expect(await result.getStorage(0n)).toBe(30n);
      });
    }
  });

  describe("non-tail recursive call (TCO does not apply)", () => {
    // factorial: n * fact(n - 1) — the multiplication
    // prevents TCO from matching. Contexts for the
    // recursive call should survive all levels.
    const source = `name NonTailRec;

define {
  function fact(n: uint256) -> uint256 {
    if (n < 2) { return 1; }
    else { return n * fact(n - 1); }
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = fact(5); }`;

    for (const level of allLevels) {
      it(`preserves recursive call contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        // Two caller JUMPs (main -> fact, fact -> fact)
        // and two continuation JUMPDESTs for them.
        expect(counts.invokeJump).toEqual({ fact: 2 });
        expect(counts.invokeJumpdest).toEqual({ fact: 1 });
        expect(counts.returnJumpdest).toEqual({ fact: 2 });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(120n);
      });
    }
  });

  describe("mutual recursion", () => {
    const source = `name Mutual;

define {
  function isEven(n: uint256) -> uint256 {
    if (n == 0) { return 1; }
    else { return isOdd(n - 1); }
  };
  function isOdd(n: uint256) -> uint256 {
    if (n == 0) { return 0; }
    else { return isEven(n - 1); }
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = isEven(4); }`;

    for (const level of allLevels) {
      it(`preserves both functions' contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        // isEven called from main and from isOdd.
        // isOdd called from isEven.
        // Each function has one callee entry JUMPDEST.
        expect(counts.invokeJump).toEqual({
          isEven: 2,
          isOdd: 1,
        });
        expect(counts.invokeJumpdest).toEqual({
          isEven: 1,
          isOdd: 1,
        });
        expect(counts.returnJumpdest).toEqual({
          isEven: 2,
          isOdd: 1,
        });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(1n);
      });
    }
  });

  describe("nested calls (one function calls another)", () => {
    const source = `name Nested;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
  function addThree(x: uint256, y: uint256, z: uint256) -> uint256 {
    let s1 = add(x, y);
    let s2 = add(s1, z);
    return s2;
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = addThree(1, 2, 3); }`;

    for (const level of allLevels) {
      it(`preserves nested call contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        expect(counts.invokeJump).toEqual({
          addThree: 1,
          add: 2,
        });
        expect(counts.invokeJumpdest).toEqual({
          addThree: 1,
          add: 1,
        });
        expect(counts.returnJumpdest).toEqual({
          addThree: 1,
          add: 2,
        });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(6n);
      });
    }
  });

  describe("multiple returns of same constant (return merging)", () => {
    // Triggers return-merging at level 3: two `return 42`
    // blocks collapse into one. Only one return context
    // survives in bytecode, but it must still be present
    // and identify the right function.
    const source = `name ReturnMerge;

define {
  function check(a: uint256, b: uint256) -> uint256 {
    if (a == 0) { return 42; }
    if (b == 0) { return 42; }
    return a + b;
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = check(3, 4); }`;

    for (const level of allLevels) {
      it(`preserves check call contexts at level ${level}`, async () => {
        const program = await compileAt(source, level);
        const counts = countCallSites(program);

        expect(counts.invokeJump).toEqual({ check: 1 });
        expect(counts.invokeJumpdest).toEqual({ check: 1 });
        expect(counts.returnJumpdest).toEqual({ check: 1 });

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(7n);
      });
    }
  });

  describe("tail call optimization preserves invoke and return", () => {
    // `count` is tail-recursive: the recursive call is in
    // return position. At levels 2 and 3, TCO rewrites the
    // recursive call into a back-edge JUMP. That JUMP
    // carries a single flat context with BOTH discriminators:
    //   - return: previous iteration's return
    //   - invoke: new iteration's call
    //
    // Depth stays constant across the JUMP — one frame pops,
    // one pushes. The function's terminal RETURN emits a
    // return context normally, popping the final frame.
    const source = `name TailCall;

define {
  function succ(n: uint256) -> uint256 {
    return n + 1;
  };
  function count(n: uint256, target: uint256) -> uint256 {
    if (n < target) { return count(succ(n), target); }
    else { return n; }
  };
}

storage { [0] r: uint256; }
create { r = 0; }
code { r = count(0, 5); }`;

    it("keeps both call contexts at level 1 (no TCO)", async () => {
      const program = await compileAt(source, 1);
      const counts = countCallSites(program);

      // Initial count call from main, plus the recursive
      // self-call. succ is still a separate function call.
      expect(counts.invokeJump).toEqual({ count: 2, succ: 1 });
      expect(counts.invokeJumpdest).toEqual({ count: 1, succ: 1 });
      expect(counts.returnJumpdest).toEqual({ count: 2, succ: 1 });
      // At level 1 there are no TCO back-edge JUMPs.
      expect(counts.returnJump).toEqual({});
    });

    for (const level of [2, 3] as const) {
      it(
        `preserves invoke and return on TCO back-edge ` +
          `JUMP at level ${level}`,
        async () => {
          const program = await compileAt(source, level);
          const counts = countCallSites(program);

          // Both count invokes are still present: the
          // initial call JUMP and the TCO'd back-edge JUMP.
          // `succ` keeps its call/return contexts since
          // it's invoked each iteration.
          expect(counts.invokeJump).toEqual({ count: 2, succ: 1 });

          // Only one callee-entry JUMPDEST per function:
          // count's is shared between first entry (from
          // the TCO trampoline) and subsequent iterations
          // (from the TCO'd JUMP).
          expect(counts.invokeJumpdest).toEqual({ count: 1, succ: 1 });

          // The initial count call's continuation JUMPDEST
          // and succ's continuation JUMPDEST both carry
          // return contexts as usual.
          expect(counts.returnJumpdest).toEqual({ count: 1, succ: 1 });

          // The TCO back-edge JUMP additionally carries a
          // return context for `count` (the previous
          // iteration's return), paired with its invoke on
          // a single flat context. This keeps the debugger's
          // logical frame depth constant across the
          // back-edge.
          expect(counts.returnJump).toEqual({ count: 1 });

          // The TCO back-edge JUMP is the one carrying both
          // invoke and return discriminators on the same
          // context object. Its invoke target must be patched
          // to the actual count entry, not left as the
          // placeholder offset 0 — this guards against
          // patchInvokeTarget missing flat combined contexts.
          const tcoJump = program.instructions.find(
            (instr) =>
              instr.operation?.mnemonic === "JUMP" &&
              instr.context !== undefined &&
              Context.isInvoke(instr.context) &&
              Context.isReturn(instr.context),
          );
          expect(tcoJump).toBeDefined();
          const ctx = tcoJump!.context as Format.Program.Context.Invoke;
          const invocation = ctx.invoke;
          expect(Invocation.isInternalCall(invocation)).toBe(true);
          const internalCall =
            invocation as Format.Program.Context.Invoke.Invocation.InternalCall;
          const invokeTarget = internalCall.target.pointer;
          expect(invokeTarget).toBeDefined();
          expect(
            "offset" in invokeTarget ? invokeTarget.offset : undefined,
          ).not.toBe(0);

          // Still correct end-to-end.
          const result = await executeProgram(source, {
            calldata: "",
            optimizationLevel: level,
          });
          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(0n)).toBe(5n);
        },
      );
    }
  });
});
