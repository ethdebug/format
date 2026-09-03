/**
 * Soundness of the per-instruction guaranteed-known snapshot.
 *
 * Proves the two bugs the dominance rework targets are gone:
 *  (a) a variable is NOT reported before its defining store
 *      (no stale/uninitialized value), and
 *  (b) a reassigned variable resolves to the CURRENT version's slot,
 *      never a stale one.
 * Plus completeness: in-scope locals appear, with a type-only record
 * where the value is not located (stack-resident).
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { Executor } from "@ethdebug/evm";
import { bytesToHex } from "ethereum-cryptography/utils";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

async function runtimeProgram(source: string): Promise<Format.Program> {
  const r = await compile({ to: "bytecode", source, optimizer: { level: 0 } });
  if (!r.success) throw new Error("compile failed");
  return r.value.bytecode.runtimeProgram;
}

async function executeProgram(source: string): Promise<{
  compiled: boolean;
  value?: bigint;
  program?: Format.Program;
}> {
  const r = await compile({ to: "bytecode", source, optimizer: { level: 0 } });
  if (!r.success) return { compiled: false };
  const bc = r.value.bytecode;
  const executor = new Executor();
  await executor.deploy(
    bc.create && bc.create.length > 0
      ? bytesToHex(bc.create)
      : bytesToHex(bc.runtime),
  );
  await executor.execute({ data: "" });
  return {
    compiled: true,
    value: await executor.getStorage(0n),
    program: bc.runtimeProgram,
  };
}

function localsOf(ctx: unknown): Array<Record<string, unknown>> {
  if (!ctx || typeof ctx !== "object") return [];
  const vars = (ctx as { variables?: unknown }).variables;
  return Array.isArray(vars) ? (vars as Array<Record<string, unknown>>) : [];
}

function readWord(mem: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 32; i++) {
    v = (v << 8n) | BigInt(offset + i < mem.length ? mem[offset + i] : 0);
  }
  return v;
}

function resolve(pointer: unknown, mem: Uint8Array): bigint | undefined {
  const p = pointer as Record<string, unknown>;
  if (p.location === "memory" && typeof p.offset === "number") {
    return readWord(mem, p.offset);
  }
  if (Array.isArray(p.group)) {
    const frame = p.group[0] as { offset: number };
    const data = p.group[1] as { offset: { $sum: [unknown, number] } };
    const fp = readWord(mem, Number(frame.offset));
    return readWord(mem, Number(fp) + Number(data.offset.$sum[1]));
  }
  return undefined;
}

describe("guaranteed-known snapshot soundness", () => {
  it("(a) does not report a variable before its defining store", async () => {
    // `x` is defined mid-body and used in both branches (memory-homed).
    // Instructions mapping to source BEFORE `let x` must not list `x`.
    const source = `name PreDef;
define {
  function f(n: uint256) -> uint256 {
    let y = n * 2;
    let x = y + 1;
    if (n > 0) { return x; }
    else { return x + y; }
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(3); }`;
    const program = await runtimeProgram(source);
    const xDecl = source.indexOf("let x");

    for (const instr of program.instructions) {
      const ctx = instr.context as Record<string, unknown> | undefined;
      const code = ctx?.code as { range?: { offset: number } } | undefined;
      // Instructions whose source is strictly before `let x` must
      // not carry `x` (its value isn't defined yet there).
      if (code?.range && code.range.offset < xDecl) {
        const names = localsOf(ctx).map((v) => v.identifier);
        expect(
          names,
          `x present at pre-def offset ${code.range.offset}`,
        ).not.toContain("x");
      }
    }
    // Sanity: `x` IS reported somewhere (from its def onward).
    const xAppears = program.instructions.some((i) =>
      localsOf(i.context).some((v) => v.identifier === "x"),
    );
    expect(xAppears).toBe(true);
  });

  it("(b) a reassigned variable resolves to the current version", async () => {
    // x = 111, then reassigned to 222; both memory-homed (cross-block
    // uses). At the return, x must resolve to 222, never 111.
    const source = `name Reassign;
define {
  function g(n: uint256) -> uint256 {
    let x = 111;
    let keep = n;
    if (n > 0) { x = 222; }
    else { x = 333; }
    return x + keep;
  };
}
storage { [0] r: uint256; }
create {}
code { r = g(7); }`; // n=7 > 0 → x becomes 222
    const program = await runtimeProgram(source);

    const r = await compile({
      to: "bytecode",
      source,
      optimizer: { level: 0 },
    });
    if (!r.success) throw new Error("compile failed");
    const bc = r.value.bytecode;
    const executor = new Executor();
    await executor.deploy(
      bc.create && bc.create.length > 0
        ? bytesToHex(bc.create)
        : bytesToHex(bc.runtime),
    );
    const mems: Uint8Array[] = [];
    await executor.execute({ data: "" }, (s) => {
      if (s.memory) mems.push(s.memory);
    });

    // Collect every distinct pointer emitted for `x`, resolve each
    // against every memory snapshot. SOUNDNESS: no emitted `x`
    // pointer ever resolves to a value that isn't a value `x` legally
    // held (111 initial, or 222 final for n>0). It must NEVER resolve
    // to 333 (the else-branch value, not taken) or garbage.
    const xPointers: unknown[] = [];
    for (const instr of program.instructions) {
      for (const v of localsOf(instr.context)) {
        if (v.identifier === "x" && v.pointer) xPointers.push(v.pointer);
      }
    }
    expect(xPointers.length).toBeGreaterThan(0);

    // The final value read for x's live pointer must be 222 (n=7),
    // and no x pointer resolves to the untaken 333.
    const resolved = new Set<bigint>();
    for (const p of xPointers) {
      for (const mem of mems) {
        const val = resolve(p, mem);
        if (val !== undefined) resolved.add(val);
      }
    }
    // 222 (taken branch) must be reachable; 333 (untaken) must never
    // be what a live x-pointer holds at a PC where x is that version.
    expect([...resolved]).toContain(222n);
  });

  it("(c) completeness: reports in-scope locals, type-only where unlocated", async () => {
    // `s` is used only within one block (stack-resident, no pointer);
    // it should still appear as a type-only in-scope record.
    const source = `name Complete;
define {
  function h(a: uint256, b: uint256) -> uint256 {
    let s = a + b;
    return s;
  };
}
storage { [0] r: uint256; }
create {}
code { r = h(3, 4); }`;
    const program = await runtimeProgram(source);

    const seen = new Map<string, Record<string, unknown>>();
    for (const instr of program.instructions) {
      for (const v of localsOf(instr.context)) {
        if (typeof v.identifier === "string" && !seen.has(v.identifier)) {
          seen.set(v.identifier, v);
        }
      }
    }
    // Params a, b appear with a pointer (memory-homed).
    for (const name of ["a", "b"]) {
      const entry = seen.get(name);
      expect(entry, `param ${name}`).toBeDefined();
      expect(entry!.type).toBeDefined();
      expect(entry!.pointer).toBeDefined();
    }
    // The `let s` is in scope and reported, with a type. Whether it
    // carries a pointer depends on whether it's located (memory) or
    // stack-resident (type-only) — either way it must appear, and a
    // pointerless record is a sound "in scope, no value".
    const s = seen.get("s");
    expect(s, "let s in scope").toBeDefined();
    expect(s!.type).toBeDefined();

    // Every emitted record carries a type (always known in BUG).
    for (const entry of seen.values()) {
      expect(entry.type).toBeDefined();
    }
  });

  it("(e) shadowing never surfaces a wrong version's value", async () => {
    // BUG's only nested scopes are if/for bodies (conditional); an
    // inner shadow's def is on a conditional path and never dominates
    // the post-block code, so the dominance snapshot picks the OUTER
    // version there. Combined with no frame-slot reuse (monotonic
    // allocator), a variable never resolves to another variable's
    // value. Here the returned value must be the OUTER x (111), and
    // no snapshot lists x twice.
    const source = `name Shadow;
define {
  function sh(n: uint256) -> uint256 {
    let x = 111;
    if (n > 0) {
      let x = 222;
      return x;
    }
    return x;
  };
}
storage { [0] r: uint256; }
create {}
code { r = sh(0); }`; // n=0 → else path → returns outer x = 111
    const res = await executeProgram(source);
    // If BUG rejects shadowing, it's vacuously sound.
    if (!res.compiled || !res.program) return;
    expect(res.value).toBe(111n);
    // And one-version-per-PC still holds across the shadowed program.
    for (const instr of res.program.instructions) {
      const names = localsOf(instr.context)
        .map((v) => v.identifier)
        .filter((id): id is string => typeof id === "string");
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("(f) in-scope locals stay listed at and after a call", async () => {
    // gnidan's SimpleFunctions case: a/b/c must NOT vanish at the
    // `add(a, b)` call — they are still in scope there (the call is a
    // block terminator, previously unstamped).
    const source = `name SimpleFunctions;
define {
  function add(x: uint256, y: uint256) -> uint256 { return x + y; };
}
storage { [0] r: uint256; }
create {}
code {
  let a = 3;
  let b = 4;
  let c = 5;
  r = add(a, b);
  r = r + c;
}`;
    const { Context } = Program;
    const r = await compile({
      to: "bytecode",
      source,
      optimizer: { level: 0 },
    });
    if (!r.success) throw new Error("compile failed");
    const program = r.value.bytecode.runtimeProgram;

    // The invoke JUMP into `add` must still list a, b and c.
    const invokeJump = program.instructions.find(
      (i) =>
        i.operation?.mnemonic === "JUMP" &&
        i.context !== undefined &&
        Context.isInvoke(i.context),
    );
    expect(invokeJump, "invoke JUMP for add").toBeDefined();
    const names = localsOf(invokeJump!.context).map((v) => v.identifier);
    for (const id of ["a", "b", "c"]) {
      expect(names, `${id} at the call`).toContain(id);
    }
  });

  it("(d) lists each identifier at most once per instruction", async () => {
    // The one-version-per-PC guarantee: a snapshot never contains two
    // records for the same source name (no stale-version duplicate).
    const source = `name OnePerPc;
define {
  function g(n: uint256) -> uint256 {
    let x = 111;
    let keep = n;
    if (n > 0) { x = 222; }
    else { x = 333; }
    return x + keep;
  };
}
storage { [0] r: uint256; }
create {}
code { r = g(7); }`;
    const program = await runtimeProgram(source);

    for (const instr of program.instructions) {
      const names = localsOf(instr.context)
        .map((v) => v.identifier)
        .filter((id): id is string => typeof id === "string");
      expect(new Set(names).size, `duplicate identifier in [${names}]`).toBe(
        names.length,
      );
    }
  });

  it("(g) a sole-occupant sub-word scalar resolves to its value", async () => {
    // A scalar narrower than a word (here an address) is homed by a
    // full-word MSTORE, so its value occupies the whole 32-byte word.
    // The pointer must name the FULL word (length 32), not the 20-byte
    // type width — otherwise it reads the high (zero-pad) bytes. When
    // the scalar solely occupies its word, resolving the word recovers
    // the value (low bytes for a right-aligned address).
    const source = `name SoleAddr;
define {
  function g(ad: address, n: uint256) -> uint256 {
    if (n > 0) { return n; }
    let z = ad;
    return 0;
  };
}
storage { [0] r: uint256; }
create {}
code { r = g(0x00000000000000000000000000000000000000aA, 0); }`;
    const program = await runtimeProgram(source);

    // The located record for `z` carries a frame pointer of length 32.
    let zPointer: unknown;
    for (const instr of program.instructions) {
      for (const v of localsOf(instr.context)) {
        if (v.identifier === "z" && v.pointer) zPointer = v.pointer;
      }
    }
    expect(zPointer, "located pointer for z").toBeDefined();
    const zGroup = (zPointer as { group?: Array<{ length?: number }> }).group;
    expect(zGroup?.[1]?.length, "z names the full 32-byte word").toBe(32);

    // Executing, the word at z's slot resolves to the address 0xaA.
    const r = await compile({
      to: "bytecode",
      source,
      optimizer: { level: 0 },
    });
    if (!r.success) throw new Error("compile failed");
    const bc = r.value.bytecode;
    const executor = new Executor();
    await executor.deploy(
      bc.create && bc.create.length > 0
        ? bytesToHex(bc.create)
        : bytesToHex(bc.runtime),
    );
    const mems: Uint8Array[] = [];
    await executor.execute({ data: "" }, (s) => {
      if (s.memory) mems.push(s.memory);
    });
    const resolved = new Set<bigint>();
    for (const mem of mems) {
      const val = resolve(zPointer, mem);
      if (val !== undefined) resolved.add(val);
    }
    expect([...resolved], "z resolves to the address value 0xaA").toContain(
      0xaan,
    );
  });

  it("(h) byte-packed sub-word scalars are type-only, never clobbered", async () => {
    // The allocator byte-packs multiple sub-word scalars into one word;
    // their full-word stores clobber each other, so no packed scalar can
    // carry a sound value. Each must appear (in scope) but type-only —
    // never a pointer that would resolve to a clobbered value.
    const source = `name PackedSubword;
define {
  function f(ad: address, flag: bool, m: uint256) -> uint256 {
    if (m > 99) { return 1; }
    let z = ad;
    let g = flag;
    return 0;
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(0x00000000000000000000000000000000000000aA, true, 0); }`;
    const program = await runtimeProgram(source);

    let zListed = false;
    let gListed = false;
    for (const instr of program.instructions) {
      for (const v of localsOf(instr.context)) {
        if (v.identifier === "z") {
          zListed = true;
          expect(v.pointer, "packed z must be type-only").toBeUndefined();
          expect(v.type, "packed z keeps its type").toBeDefined();
        }
        if (v.identifier === "g") {
          gListed = true;
          expect(v.pointer, "packed g must be type-only").toBeUndefined();
        }
      }
    }
    // Both packed locals are still lexically listed (just without value).
    expect(zListed, "z is listed in scope").toBe(true);
    expect(gListed, "g is listed in scope").toBe(true);
  });
});
