/**
 * Regression: returning from a branch must yield the return
 * expression, not a stale stack value.
 *
 * A user function's return epilogue cleans up leftover stack values
 * (e.g. a branch condition, or an operand DUP'd by loadValue) before
 * jumping back to the caller, keeping only the return value. When two
 * or more stale values sit below the return value, the cleanup must
 * still preserve the return value. A prior rotation bug returned the
 * deepest stale value (the branch condition) instead.
 */
import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

type OptLevel = 0 | 1 | 2 | 3;
const LEVELS: OptLevel[] = [0, 1, 2, 3];

async function storageResult(source: string, level: OptLevel): Promise<bigint> {
  const res = await executeProgram(source, {
    calldata: "",
    optimizationLevel: level,
  });
  expect(res.callSuccess).toBe(true);
  return res.getStorage(0n);
}

describe("return epilogue preserves the return value across branches", () => {
  // The true branch (JUMPI-taken) return has two stale values below
  // the return value at runtime: the `eq` const operand and the
  // branch condition, both left by loadValue's DUP.
  const pick = `name Pick;
define {
  function pick(x: uint256) -> uint256 {
    if (x == 0) { return 9; } else { return 7; }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = pick(0); }`;

  for (const level of LEVELS) {
    it(`returns from the true branch (level ${level})`, async () => {
      expect(await storageResult(pick, level)).toBe(9n);
    });
  }

  // Returning a parameter (not a constant) from the true branch.
  const base = `name Base;
define {
  function base(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; } else { return acc; }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = base(0, 42); }`;

  for (const level of LEVELS) {
    it(`returns a parameter from the true branch (level ${level})`, async () => {
      expect(await storageResult(base, level)).toBe(42n);
    });
  }

  // A call in return position, from a branch that itself returns a
  // call result. Exercises the epilogue on a continuation-return with
  // leftover stack values, without recursion. `g(0)` takes its true
  // branch and returns `f(0)`, which takes its true branch and
  // returns 11.
  const chain = `name Chain;
define {
  function f(x: uint256) -> uint256 {
    if (x == 0) { return 11; } else { return 22; }
  };
  function g(x: uint256) -> uint256 {
    if (x == 0) { return f(0); } else { return f(1); }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = g(0); }`;

  for (const level of LEVELS) {
    it(`returns a call result from a branch (level ${level})`, async () => {
      expect(await storageResult(chain, level)).toBe(11n);
    });
  }

  // NOTE: self-recursive functions (e.g. `sum(5,0)` returning 15) are
  // still miscompiled by a separate, deeper defect — untracked leaked
  // stack values desync the linear stack model at the recursive call
  // site, corrupting the callee's arguments. That is tracked apart
  // from this epilogue fix; see the accompanying issue.
});
