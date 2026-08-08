/**
 * Runtime-correctness tests for local-variable pointers.
 *
 * Shape tests verify what we emit; these verify it RESOLVES. Each
 * emitted pointer is resolved against a real EVM trace's machine
 * memory and must yield the variable's actual known value — proving
 * the pointer points at the bytes the variable really occupies.
 *
 * Covers both location kinds:
 *  - frame-relative (`mem[ mem[FRAME_POINTER] + delta ]`) for
 *    function locals, and
 *  - static absolute (`mem[offset]`) for main/create locals.
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { Executor } from "@ethdebug/evm";
import { bytesToHex } from "ethereum-cryptography/utils";
import type * as Format from "@ethdebug/format";

/** Read a 32-byte big-endian word from a memory snapshot. */
function readWord(mem: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 32; i++) {
    const b = offset + i < mem.length ? mem[offset + i] : 0;
    v = (v << 8n) | BigInt(b);
  }
  return v;
}

/**
 * Resolve a bugc-emitted local pointer against a memory snapshot —
 * a minimal evaluator for the two shapes this feature emits.
 */
function resolve(pointer: unknown, mem: Uint8Array): bigint | undefined {
  const p = pointer as Record<string, unknown>;
  if (p.location === "memory" && typeof p.offset === "number") {
    // static absolute: mem[offset]
    return readWord(mem, p.offset);
  }
  if (Array.isArray(p.group)) {
    // frame-relative: mem[ mem[FRAME_POINTER] + delta ]
    const frame = p.group[0] as { offset: number };
    const data = p.group[1] as { offset: { $sum: [unknown, number] } };
    const fp = readWord(mem, Number(frame.offset));
    const delta = Number(data.offset.$sum[1]);
    return readWord(mem, Number(fp) + delta);
  }
  return undefined;
}

/** Emitted pointer for each local, keyed by identifier. */
function pointersByIdentifier(program: Format.Program): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const instr of program.instructions) {
    const ctx = instr.context as Record<string, unknown> | undefined;
    if (!ctx || !Array.isArray(ctx.variables)) continue;
    for (const v of ctx.variables as Array<Record<string, unknown>>) {
      if (typeof v.identifier === "string" && !out.has(v.identifier)) {
        out.set(v.identifier, v.pointer);
      }
    }
  }
  return out;
}

/**
 * Compile at O0, run with a memory-capturing trace, and assert each
 * expected local's pointer resolves to its known value at some step.
 */
async function expectResolves(
  source: string,
  expected: Record<string, bigint>,
): Promise<void> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level: 0 },
  });
  if (!result.success) throw new Error("compile failed");
  const program = result.value.bytecode.runtimeProgram;
  const pointers = pointersByIdentifier(program);

  const bc = result.value.bytecode;
  const createCode =
    bc.create && bc.create.length > 0
      ? bytesToHex(bc.create)
      : bytesToHex(bc.runtime);
  const executor = new Executor();
  await executor.deploy(createCode);

  const memories: Uint8Array[] = [];
  await executor.execute({ data: "" }, (step) => {
    if (step.memory) memories.push(step.memory);
  });
  expect(memories.length).toBeGreaterThan(0);

  for (const [name, want] of Object.entries(expected)) {
    const pointer = pointers.get(name);
    expect(pointer, `pointer emitted for ${name}`).toBeDefined();
    const resolvedSomewhere = memories.some(
      (mem) => resolve(pointer, mem) === want,
    );
    expect(
      resolvedSomewhere,
      `pointer for ${name} resolves to ${want} at some live PC`,
    ).toBe(true);
  }
}

describe("local-variable pointers resolve to the correct runtime bytes", () => {
  it("frame-relative params resolve against machine memory", async () => {
    // Distinctive values so a correct resolve can't be a coincidence.
    await expectResolves(
      `name FrameLocal;
define {
  function add(a: uint256, b: uint256) -> uint256 { return a + b; };
}
storage { [0] r: uint256; }
create {}
code { r = add(43690, 48059); }`,
      { a: 43690n, b: 48059n },
    );
  });

  it("static main local (no frame) resolves against machine memory", async () => {
    // `x` crosses the branch, so it is spilled to static memory and
    // homed at an absolute offset (main has no call frame).
    await expectResolves(
      `name StaticLocal;
storage { [0] r: uint256; [1] flag: uint256; }
create { flag = 1; }
code {
  let x = 51966;
  if (flag > 0) { r = 0; }
  else { r = 1; }
  r = x;
}`,
      { x: 51966n },
    );
  });
});
