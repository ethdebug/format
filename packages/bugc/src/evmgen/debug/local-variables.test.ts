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

/** True if a pointer is a frame-relative group (name "frame" + $read). */
function isFrameRelative(pointer: unknown): boolean {
  if (!pointer || typeof pointer !== "object") return false;
  const group = (pointer as { group?: unknown[] }).group;
  if (!Array.isArray(group) || group.length < 2) return false;
  const frame = group[0] as Record<string, unknown>;
  const data = group[1] as Record<string, unknown>;
  if (frame.name !== "frame" || frame.location !== "memory") return false;
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
