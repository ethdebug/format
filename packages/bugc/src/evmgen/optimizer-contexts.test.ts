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
 * invoke context is preserved on the jump that replaces the
 * recursive call, but no matching return context is emitted
 * because the tail call folds into the outer activation's
 * return.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;

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
}

/**
 * Scan a program and count invoke/return contexts by
 * instruction type and function identifier.
 */
function countCallSites(program: Format.Program): CallSiteCounts {
  const counts: CallSiteCounts = {
    invokeJump: {},
    invokeJumpdest: {},
    returnJumpdest: {},
  };

  for (const instr of program.instructions) {
    const ctx = instr.context;
    if (!ctx) continue;

    const mn = instr.operation?.mnemonic;

    if (Context.isInvoke(ctx)) {
      const invoke = ctx.invoke;
      const id = invoke.identifier ?? "?";
      if (mn === "JUMP") {
        counts.invokeJump[id] = (counts.invokeJump[id] ?? 0) + 1;
      } else if (mn === "JUMPDEST") {
        counts.invokeJumpdest[id] = (counts.invokeJumpdest[id] ?? 0) + 1;
      }
    } else if (Context.isReturn(ctx) && mn === "JUMPDEST") {
      const id = ctx.return.identifier ?? "?";
      counts.returnJumpdest[id] = (counts.returnJumpdest[id] ?? 0) + 1;
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

  describe("tail call optimization preserves invoke contexts", () => {
    // `count` is tail-recursive: the recursive call is in
    // return position. At levels 2 and 3, TCO rewrites the
    // recursive call into a jump, but the invoke context
    // must still be emitted on that jump so debuggers can
    // see "this was a recursive call" in the trace.
    //
    // No return context is emitted for the TCO'd call —
    // the tail call folds into the outer activation's
    // return. A future `transform: tailcall` marker will
    // let the debugger reconcile the missing return with
    // the eventual outer return popping all tail frames.
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
    });

    for (const level of [2, 3] as const) {
      it(
        `preserves invoke on TCO'd jump but drops its ` +
          `return context at level ${level}`,
        async () => {
          const program = await compileAt(source, level);
          const counts = countCallSites(program);

          // Both count invokes are still present: the
          // initial call JUMP and the TCO'd recursive
          // JUMP (which targets the loop header). `succ`
          // keeps its call/return contexts since it's
          // invoked each iteration.
          expect(counts.invokeJump).toEqual({ count: 2, succ: 1 });

          // Only one callee-entry JUMPDEST per function:
          // count's is shared between first entry (from
          // the TCO trampoline) and subsequent iterations
          // (from the TCO'd jump).
          expect(counts.invokeJumpdest).toEqual({ count: 1, succ: 1 });

          // Only the initial count call has a continuation
          // JUMPDEST; the TCO'd call has no return because
          // it folds into the outer activation's return.
          expect(counts.returnJumpdest).toEqual({ count: 1, succ: 1 });

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
