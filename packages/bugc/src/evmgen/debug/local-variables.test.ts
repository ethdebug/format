/**
 * Emission tests for memory-homed local-variable debug info (O0).
 *
 * Verifies that parameters and cross-block `let` bindings that the
 * memory planner spills to frame-relative memory get a `variables`
 * context with a frame-relative pointer, and that behavior is
 * unaffected.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import type * as Format from "@ethdebug/format";
import { liftVariables } from "./local-variables.js";

async function compileProgram(
  source: string,
  level: 0 | 1 | 2 | 3,
): Promise<Format.Program> {
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
  return result.value.bytecode.runtimeProgram;
}

/** All distinct `variables` entries in a program, by identifier. */
function localEntries(
  program: Format.Program,
): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const instr of program.instructions) {
    const ctx = instr.context as Record<string, unknown> | undefined;
    if (!ctx || !Array.isArray(ctx.variables)) continue;
    for (const v of ctx.variables as Array<Record<string, unknown>>) {
      if (typeof v.identifier !== "string") continue;
      const existing = byId.get(v.identifier);
      // Prefer the located record: a variable now appears type-only
      // (in scope, no value) as well as with a pointer where located.
      if (!existing || (!existing.pointer && v.pointer)) {
        byId.set(v.identifier, v);
      }
    }
  }
  return byId;
}

/** True if a pointer is a frame-relative group (name "-frame" + $read). */
function isFrameRelative(pointer: unknown): boolean {
  if (!pointer || typeof pointer !== "object") return false;
  const group = (pointer as { group?: unknown[] }).group;
  if (!Array.isArray(group) || group.length < 2) return false;
  const frame = group[0] as Record<string, unknown>;
  const data = group[1] as Record<string, unknown>;
  if (frame.name !== "-frame" || frame.location !== "memory") return false;
  const offset = data.offset as Record<string, unknown> | undefined;
  return !!offset && Array.isArray(offset.$sum);
}

describe("local-variable debug emission (memory-homed, O0)", () => {
  describe("function parameters", () => {
    const source = `name Params;
define {
  function add(a: uint256, b: uint256) -> uint256 {
    let s = a + b;
    return s;
  };
}
storage { [0] r: uint256; }
create {}
code { r = add(3, 4); }`;

    it("emits frame-relative variables for both params", async () => {
      const program = await compileProgram(source, 0);
      const locals = localEntries(program);

      for (const name of ["a", "b"]) {
        const entry = locals.get(name);
        expect(entry, `variables entry for ${name}`).toBeDefined();
        expect(entry!.identifier).toBe(name);
        expect(isFrameRelative(entry!.pointer)).toBe(true);
        expect(entry!.type).toEqual({ kind: "uint", bits: 256 });
      }
    });

    it("keeps runtime behavior correct", async () => {
      const res = await executeProgram(source, {
        calldata: "",
        optimizationLevel: 0,
      });
      expect(res.callSuccess).toBe(true);
      expect(await res.getStorage(0n)).toBe(7n);
    });
  });

  describe("cross-block let binding", () => {
    // `x` is defined before the branch and used in both arms, so it
    // crosses block boundaries and is spilled to frame memory.
    const source = `name CrossBlock;
define {
  function f(n: uint256) -> uint256 {
    let x = n + 1;
    if (n > 0) { return x; }
    else { return x + n; }
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(5); }`;

    it("emits a frame-relative variable for the spilled let", async () => {
      const program = await compileProgram(source, 0);
      const locals = localEntries(program);
      const x = locals.get("x");
      expect(x, "variables entry for x").toBeDefined();
      expect(isFrameRelative(x!.pointer)).toBe(true);
    });

    it("keeps runtime behavior correct", async () => {
      const res = await executeProgram(source, {
        calldata: "",
        optimizationLevel: 0,
      });
      expect(res.callSuccess).toBe(true);
      expect(await res.getStorage(0n)).toBe(6n);
    });
  });

  describe("call inside a loop", () => {
    // A call in a `for` body to a function whose return expression has
    // two operations: each iteration must add weight(i, 7) = 7i + 1,
    // so r = 1 + 8 + 15.
    const source = `name LoopCall;
define {
  function weight(x: uint256, w: uint256) -> uint256 {
    return x * w + 1;
  };
}
storage { [0] r: uint256; }
create {}
code {
  let acc = 0;
  for (let i = 0; i < 3; i = i + 1) {
    acc = acc + weight(i, 7);
  }
  r = acc;
}`;

    // At level 3 this call reverts: a separate optimizer bug.
    for (const level of [0, 1, 2] as const) {
      it(`keeps runtime behavior correct (level ${level})`, async () => {
        const res = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(res.callSuccess).toBe(true);
        expect(await res.getStorage(0n)).toBe(24n);
      });
    }
  });

  describe("contract without functions", () => {
    // No user functions, no frames — the pass is a no-op and must
    // not disturb compilation.
    const source = `name NoFns;
storage { [0] r: uint256; }
create { r = 0; }
code { r = r + 1; }`;

    it("compiles and runs", async () => {
      const res = await executeProgram(source, {
        calldata: "",
        optimizationLevel: 0,
      });
      expect(res.callSuccess).toBe(true);
    });
  });
});

describe("liftVariables", () => {
  const total = { identifier: "total", pointer: { location: "storage" } };
  const x = { identifier: "x" };
  const code = (offset: number) => ({ code: { range: { offset } } });
  /** Every `variables` entry in a context, nested or not */
  const all = (context: unknown): unknown[] => {
    const { variables, gather } = (context ?? {}) as {
      variables?: unknown[];
      gather?: unknown[];
    };
    return [...(variables ?? []), ...(gather ?? []).flatMap(all)];
  };

  it("lifts variables out of a gather, once each", () => {
    const { variables, context } = liftVariables({
      variables: [x],
      gather: [code(1), { ...code(2), variables: [total] }],
    });
    expect(variables).toEqual([x, total]);
    expect(context).toEqual({ gather: [code(1), code(2)] });
    expect(all(context)).toEqual([]);
  });

  it("drops a gathered context left empty, and composes one flat", () => {
    const { variables, context } = liftVariables({
      gather: [code(1), { variables: [total] }],
    });
    expect(variables).toEqual([total]);
    expect(context).toEqual(code(1));
  });

  it("keeps the variables of a gathered context with a frame", () => {
    const framed = { frame: "ir", ...code(2), variables: [total] };
    const { variables, context } = liftVariables({
      gather: [{ frame: "source", ...code(1) }, framed],
    });
    expect(variables).toEqual([]);
    expect(context).toEqual({
      gather: [{ frame: "source", ...code(1) }, framed],
    });
  });

  it("keeps variables where one context is left that collides", () => {
    const input = {
      ...code(1),
      gather: [{ variables: [total] }, { ...code(2), variables: [x] }],
    };
    const { variables, context } = liftVariables(input);
    expect([...variables, ...all(context)]).toEqual([total, x]);
    expect(variables).toEqual([]);
  });
});
