/**
 * Behavioral + structural tests for the function-inlining pass
 * (level 2).
 *
 * Inlining must (a) preserve runtime behavior exactly, and
 * (b) actually replace eligible calls with the callee's body —
 * a fully-inlined callee is deleted and no `call` to it remains.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import * as Ir from "#ir";
import { executeProgram } from "#test/evm/behavioral";

async function optimizedIr(
  source: string,
  level: 0 | 1 | 2 | 3,
): Promise<Ir.Module> {
  const result = await compile({
    to: "ir",
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
  return result.value.ir;
}

/** All functions in the module, including <main> and <create>. */
function allFunctions(module: Ir.Module): Ir.Function[] {
  return [
    module.main,
    ...(module.create ? [module.create] : []),
    ...module.functions.values(),
  ];
}

/** Count `call` terminators targeting `callee` across the module. */
function countCalls(module: Ir.Module, callee: string): number {
  let n = 0;
  for (const fn of allFunctions(module)) {
    for (const block of fn.blocks.values()) {
      const t = block.terminator;
      if (t.kind === "call" && t.function === callee) n += 1;
    }
  }
  return n;
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

    it("keeps the real call at levels 0-1", async () => {
      for (const level of [0, 1] as const) {
        const ir = await optimizedIr(source, level);
        expect(ir.functions.has("add")).toBe(true);
        expect(countCalls(ir, "add")).toBe(1);
      }
    });

    it("inlines the call and deletes the callee at level 2", async () => {
      const ir = await optimizedIr(source, 2);
      expect(countCalls(ir, "add")).toBe(0);
      expect(ir.functions.has("add")).toBe(false);
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
      // Both sites inlined; callee deleted.
      const ir = await optimizedIr(source, 2);
      expect(countCalls(ir, "dbl")).toBe(0);
      expect(ir.functions.has("dbl")).toBe(false);
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
      // succ stays a real call so TCO can fire on count.
      const ir = await optimizedIr(source, 2);
      expect(ir.functions.has("succ")).toBe(true);
      expect(countCalls(ir, "succ")).toBeGreaterThan(0);
    });
  });
});
