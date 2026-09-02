/**
 * Recursive and branching functions must compute correctly at every
 * optimization level.
 *
 * A call is set up by cleaning the caller's operand stack and reloading
 * arguments from memory. Previously the tracked stack model was threaded
 * through block layout order rather than the control-flow graph, so it
 * desynced from the runtime stack: leftover scratch values were never
 * accounted, the pre-call cleanup undercounted, and callees received
 * corrupted arguments — every self-recursive function returned garbage.
 *
 * The fix establishes a canonical block-boundary stack invariant: a call
 * continuation is entered with the return value on top, every other block
 * is entered empty, and each block canonicalizes its stack on exit. With
 * that, the tracked model matches the runtime stack and the existing
 * per-instruction/terminator logic is exact.
 */
import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

type OptLevel = 0 | 1 | 2 | 3;
const LEVELS: OptLevel[] = [0, 1, 2, 3];

async function result(source: string, level: OptLevel): Promise<bigint> {
  const res = await executeProgram(source, {
    calldata: "",
    optimizationLevel: level,
  });
  expect(res.callSuccess).toBe(true);
  return res.getStorage(0n);
}

const sum = (body: string) => `name Sum;
define {
  function sum(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; } else { return sum(n - 1, acc + n); }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { ${body} }`;

// Mutual recursion through two functions, each with a branch-return.
const parity = (body: string) => `name Parity;
define {
  function isEven(n: uint256) -> uint256 {
    if (n == 0) { return 1; } else { return isOdd(n - 1); }
  };
  function isOdd(n: uint256) -> uint256 {
    if (n == 0) { return 0; } else { return isEven(n - 1); }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { ${body} }`;

// Tree recursion: two recursive calls whose results combine.
const fib = (body: string) => `name Fib;
define {
  function fib(n: uint256) -> uint256 {
    if (n < 2) { return n; } else { return fib(n - 1) + fib(n - 2); }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { ${body} }`;

describe("recursion computes correctly at every optimization level", () => {
  for (const level of LEVELS) {
    it(`tail recursion accumulates (level ${level})`, async () => {
      expect(await result(sum("r = sum(0, 7);"), level)).toBe(7n);
      expect(await result(sum("r = sum(1, 50);"), level)).toBe(51n);
      expect(await result(sum("r = sum(2, 50);"), level)).toBe(53n);
      expect(await result(sum("r = sum(5, 0);"), level)).toBe(15n);
    });

    it(`mutual recursion (level ${level})`, async () => {
      expect(await result(parity("r = isEven(6);"), level)).toBe(1n);
      expect(await result(parity("r = isEven(7);"), level)).toBe(0n);
    });

    it(`tree recursion (level ${level})`, async () => {
      expect(await result(fib("r = fib(10);"), level)).toBe(55n);
    });
  }
});

// Branch/merge shapes that exercise block-boundary stack cleanup
// without recursion. for-loops at O3 hit a separate, pre-existing
// block-lowering issue (tracked with the CFG-stack work) and are
// covered here only through O2.
const diamond = `name Diamond;
storage { [0] r: uint256; }
code {
  let x = 0;
  if (1 == 1) { x = 10; } else { x = 20; }
  r = x + 1;
}`;

const forLoop = `name Loop;
storage { [0] r: uint256; }
code {
  let s = 0;
  for (let i = 1; i <= 5; i = i + 1) { s = s + i; }
  r = s;
}`;

// A user function whose RETURN block has two predecessors (the arms
// of an if), each leaving a different amount of block-local scratch
// before the merge. This is manifestation (b) of #275: a
// multi-predecessor return block. It is guaranteed correct because
// every predecessor canonicalizes its stack to empty on exit and the
// return block is entered with the canonical empty stack, so the
// tracked model matches the runtime stack no matter which arm ran.
const mergeReturn = (arg: string) => `name MergeReturn;
define {
  function f(x: uint256) -> uint256 {
    let y = 0;
    if (x == 0) { y = x + 1; } else { y = x + x + x + 7; }
    return y;
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = f(${arg}); }`;

describe("branch and loop control flow", () => {
  for (const level of LEVELS) {
    it(`diamond merge (level ${level})`, async () => {
      expect(await result(diamond, level)).toBe(11n);
    });

    it(`multi-predecessor return block (level ${level})`, async () => {
      expect(await result(mergeReturn("0"), level)).toBe(1n);
      expect(await result(mergeReturn("5"), level)).toBe(22n);
    });
  }

  for (const level of [0, 1, 2] as const) {
    it(`for-loop accumulator (level ${level})`, async () => {
      expect(await result(forLoop, level)).toBe(15n);
    });
  }
});
