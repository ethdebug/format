/**
 * Soundness of the per-instruction local-variable snapshot.
 *
 * The structural tests check which locals are listed where: never
 * before their declaration, once per name, within their scope, and at
 * calls. The program tests run small programs at every optimization
 * level and, at every step that lists a local with a pointer, read it
 * against the machine state after the step: it must hold the value the
 * program gives that local there (see `check`).
 */
import { describe, it, expect } from "vitest";

import { Program } from "@ethdebug/format";
import { executeProgram } from "#test/evm/behavioral";
import {
  type Level,
  type LocalsProgram,
  type Shape,
  check,
  localsOf,
  textBytes,
  traceLocals,
} from "#test/evm/locals";

const levels: Level[] = [0, 1, 2, 3];

/** The names listed at each instruction of a program */
async function listed(source: string, level: Level = 0) {
  const { program } = await traceLocals(source, level);
  return program.instructions.map((instruction) => ({
    instruction,
    names: localsOf(instruction.context).map((v) => v.identifier as string),
  }));
}

/** The offset of an instruction's `code`, if it has one */
function codeOffset(context: unknown): number | undefined {
  return (context as { code?: { range?: { offset: number } } } | undefined)
    ?.code?.range?.offset;
}

describe("which locals are listed", () => {
  it("(a) does not list a local before its declaration", async () => {
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
    const declared = source.indexOf("let x");
    const rows = await listed(source);
    for (const { instruction, names } of rows) {
      const offset = codeOffset(instruction.context);
      if (offset !== undefined && offset < declared) {
        expect(names, `x listed at offset ${offset}`).not.toContain("x");
      }
    }
    expect(rows.some(({ names }) => names.includes("x"))).toBe(true);
  });

  it("(b) lists every local in scope, with a type", async () => {
    // `s` is used only within one block, so it stays on the stack;
    // it is listed all the same.
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
    const { program } = await traceLocals(source);
    const entries = program.instructions.flatMap((i) => localsOf(i.context));
    for (const name of ["a", "b", "s"]) {
      const named = entries.filter((v) => v.identifier === name);
      expect(named.length, name).toBeGreaterThan(0);
      expect(named.some((v) => v.pointer)).toBe(true);
    }
    for (const entry of entries) expect(entry.type).toBeDefined();
  });

  it("(c) lists each name at most once per instruction", async () => {
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
storage { [0] r: uint256; [1] x: uint256; }
create {}
code { r = sh(0); }`;
    const { getStorage } = await executeProgram(source, { calldata: "" });
    expect(await getStorage(0n)).toBe(111n);
    for (const { names } of await listed(source)) {
      expect(new Set(names).size, `[${names}]`).toBe(names.length);
    }
  });

  it("(d) keeps locals listed at a call", async () => {
    const source = `name AtCall;
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
    const rows = await listed(source);
    const jump = rows.find(
      ({ instruction }) =>
        instruction.operation?.mnemonic === "JUMP" &&
        instruction.context !== undefined &&
        Program.Context.isInvoke(instruction.context),
    );
    expect(jump, "invoke JUMP for add").toBeDefined();
    for (const name of ["a", "b", "c"]) expect(jump!.names).toContain(name);
  });

  it("(e) lists a for loop's variable only within the loop", async () => {
    const source = `name LoopScope;
storage { [0] r: uint256; }
create {}
code {
  let acc = 0;
  for (let i = 0; i < 3; i = i + 1) {
    acc = acc + i;
  }
  r = acc;
}`;
    const after = source.indexOf("  r = acc;");
    const rows = await listed(source);
    for (const { instruction, names } of rows) {
      const offset = codeOffset(instruction.context);
      if (offset !== undefined && offset >= after) {
        expect(names).not.toContain("i");
        expect(names).toContain("acc");
      }
    }
    expect(rows.some(({ names }) => names.includes("i"))).toBe(true);
  });

  it("(f) gives a stack-resident local a stack pointer", async () => {
    const { program } = await traceLocals(programs[0].source);
    const pointers = program.instructions.flatMap((i) =>
      localsOf(i.context)
        .filter((v) => v.identifier === "p" && v.pointer)
        .map((v) => (v.pointer as { location?: string }).location),
    );
    expect(pointers.length).toBeGreaterThan(0);
    expect(new Set(pointers)).toEqual(new Set(["stack"]));
  });

  it.each([2, 3] as const)(
    "(g) lists an inlined function's locals in its inlined code at O%i",
    async (level) => {
      const source = `name Inlined;
define {
  function add(a: uint256, b: uint256) -> uint256 {
    let sum = a + b;
    return sum * 2;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code { r = add(s, 2); }`;
      const { program } = await traceLocals(source, level);
      const transforms = (context: unknown): unknown[] => {
        const { transform, gather } = (context ?? {}) as {
          transform?: unknown[];
          gather?: unknown[];
        };
        return [...(transform ?? []), ...(gather ?? []).flatMap(transforms)];
      };
      const inlined = program.instructions.filter((i) =>
        localsOf(i.context).some((v) => v.identifier === "sum" && v.pointer),
      );
      expect(inlined.length).toBeGreaterThan(0);
      for (const i of inlined) {
        expect(transforms(i.context)).toContain("inline");
      }
    },
  );

  // `dbl` is inlined into `weight` (and `weight` into the loop at O3)
  const inlinedSource = `name InlineScope;
define {
  function dbl(x: uint256) -> uint256 {
    return x + x;
  };
  function weight(i: uint256, n: uint256) -> uint256 {
    let w = dbl(i) + n;
    return w;
  };
}
storage { [0] total: uint256; [1] calls: uint256; }
create {}
code {
  let sum = 0;
  for (let i = 0; i < 2; i = i + 1) {
    sum = sum + weight(i, 4);
  }
  total = sum;
  calls = calls + 1;
}`;

  /** The activation markers (`invoke`/`return`) of a context */
  const activations = (
    context: unknown,
    key: "invoke" | "return",
  ): string[] => {
    if (!context || typeof context !== "object") return [];
    const { gather } = context as { gather?: unknown[] };
    const own = (context as Record<string, { identifier?: string }>)[key];
    return [
      ...(own ? [own.identifier as string] : []),
      ...(Array.isArray(gather)
        ? gather.flatMap((c) => activations(c, key))
        : []),
    ];
  };

  it.each([2, 3] as const)(
    "(h) lists an inlined function's locals only within its body at O%i",
    async (level) => {
      const run = await traceLocals(inlinedSource, level);
      // Contexts are postconditions: the callee's locals are in scope
      // from the step that invokes it up to, not including, the step
      // that returns from it
      let inside = false;
      let seen = 0;
      for (const step of run.steps) {
        const context = run.instructionAt(step)?.context;
        if (activations(context, "invoke").includes("dbl")) inside = true;
        if (activations(context, "return").includes("dbl")) inside = false;
        const names = localsOf(context).map((v) => v.identifier);
        if (!inside) {
          expect(names, `x listed outside dbl, pc ${step.pc}`).not.toContain(
            "x",
          );
        } else if (names.includes("x")) {
          seen++;
        }
      }
      expect(seen).toBeGreaterThan(0);
    },
  );

  it.each([2, 3] as const)(
    "(j) lists the caller's locals where an inlined function returns at O%i",
    async (level) => {
      // The callee's locals have the caller's names
      const source = `name Collide;
define {
  function f(x: uint256) -> uint256 {
    let y = x + 1;
    let total = y * 2;
    return total + y;
  };
}
storage { [0] total: uint256; [1] s: uint256; }
create { s = 4; }
code { let y = s + 3; let x = s + 10; total = f(x); total = total + y; }`;
      const main = source.indexOf("code {");
      const run = await traceLocals(source, level);
      let returns = 0;
      for (const step of run.steps) {
        const context = run.instructionAt(step)?.context;
        if (!activations(context, "return").includes("f")) continue;
        returns++;
        const locals = localsOf(context).filter((v) => {
          const pointer = JSON.stringify(v.pointer ?? {});
          return !pointer.includes('"storage"');
        });
        expect(locals.map((v) => v.identifier).sort()).toEqual(["x", "y"]);
        for (const local of locals) {
          const { range } = local.declaration as { range: { offset: number } };
          expect(range.offset, `${local.identifier}`).toBeGreaterThan(main);
        }
      }
      expect(returns).toBe(1);
    },
  );

  it.each([2, 3] as const)(
    "(k) brackets each inlined function that starts or ends with an " +
      "inlined call at O%i",
    async (level) => {
      const bodies = {
        "starts with": "let s = inner(r); return s + 1;",
        "ends with": "return inner(r);",
      };
      for (const [what, body] of Object.entries(bodies)) {
        const source = `name Nested;
define {
  function inner(p: uint256) -> uint256 { let q = p * 3; return q; };
  function outer(r: uint256) -> uint256 { ${body} };
}
storage { [0] total: uint256; [1] calls: uint256; }
create { calls = 2; }
code { let v = calls + 5; total = outer(v); total = total + v; }`;
        const run = await traceLocals(source, level);
        const events: string[] = [];
        for (const step of run.steps) {
          const context = run.instructionAt(step)?.context;
          const names = localsOf(context).map((v) => v.identifier);
          const invokes = activations(context, "invoke");
          const returns = activations(context, "return");
          events.push(
            ...invokes.map((f) => `invoke ${f}`),
            ...returns.map((f) => `return ${f}`),
          );
          // Back in main once outer returns
          if (returns.includes("outer")) {
            expect(names, `${what}, pc ${step.pc}`).toContain("v");
          }
        }
        expect(events, what).toEqual([
          "invoke outer",
          "invoke inner",
          "return inner",
          "return outer",
        ]);
      }
    },
  );

  it.each([2, 3] as const)(
    "(i) lists storage variables in inlined code at O%i",
    async (level) => {
      const { program } = await traceLocals(inlinedSource, level);
      const rows = await listed(inlinedSource, level);
      const inlined = rows.filter(({ names }) => names.includes("x"));
      expect(inlined.length).toBeGreaterThan(0);
      for (const { instruction, names } of inlined) {
        const where = `${instruction.operation?.mnemonic} at ${instruction.offset}`;
        expect(names, where).toContain("total");
        expect(names, where).toContain("calls");
      }
      // ... and nowhere apart from the flat list
      const nested = (context: unknown): boolean => {
        const { gather } = (context ?? {}) as { gather?: unknown[] };
        return (gather ?? []).some((c) => localsOf(c).length > 0 || nested(c));
      };
      for (const instruction of program.instructions) {
        expect(nested(instruction.context), `${instruction.offset}`).toBe(
          false,
        );
      }
    },
  );
});

const words: Shape = { kind: "array", element: { kind: "scalar", size: 32 } };

/** A scalar program for each sub-word kind, `ad` passed as `arg` */
const kinds = (
  [
    ["address", "0x00000000000000000000000000000000000000aA", 20, 0xaan],
    ["bool", "true", 1, 1n],
    ["uint8", "200", 1, 200n],
    ["uint32", "70000", 4, 70000n],
    // bugc cannot yet produce a nonzero intN, so read one from storage
    ["int8", "s", 1, 0n],
    ["bytes4", "0xABCDEF12", 4, 0xabcdef12n],
    ["uint256", "51966", 32, 51966n],
  ] as const
).map(
  ([type, arg, size, value]): LocalsProgram => ({
    name: `sub-word ${type}`,
    source: `name Subword;
define {
  function g(ad: ${type}, n: uint256) -> uint256 {
    if (n > 0) { return n; }
    let z = ad;
    return 0;
  };
}
storage { [0] r: uint256; [1] s: int8; }
create {}
code { r = g(${arg}, 0); }`,
    locals: {
      ad: { values: [value], size },
      z: { values: [value], size },
      n: { values: [0n] },
    },
  }),
);

/**
 * Programs and the values their locals take, in execution order. A
 * value with `after` may be read only once that statement has run.
 */
const programs: LocalsProgram[] = [
  {
    name: "straight line",
    source: `name Straight;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code {
  let n = 4;
  let p = n + s;
  r = p * n;
}`,
    locals: { n: { values: [4n] }, p: { values: [9n] } },
  },
  {
    name: "store timing",
    source: `name StoreTiming;
define {
  function f(a: uint256) -> uint256 {
    let n = a + 3;
    if (a > 0) { return n; }
    return n + 1;
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(4); }`,
    locals: { a: { values: [4n] }, n: { values: [7n] } },
  },
  {
    name: "one-armed if",
    source: `name OneArmed;
storage { [0] r: uint256; [1] flag: uint256; }
create { flag = 1; }
code {
  let x = 7;
  if (flag > 0) { x = 9; }
  r = x;
}`,
    locals: { x: { values: [7n, { value: 9n, after: "x = 9" }] } },
  },
  {
    name: "if-else",
    source: `name IfElse;
storage { [0] r: uint256; [1] flag: uint256; }
create { flag = 0; }
code {
  let x = 7;
  let y = 1;
  if (flag > 0) { y = 2; }
  else { y = 3; }
  x = x * y;
  r = x + y;
}`,
    locals: {
      x: { values: [7n, { value: 21n, after: "x = x * y" }] },
      y: { values: [1n, { value: 3n, after: "y = 3" }] },
    },
  },
  {
    name: "if-else reassigning in both arms",
    source: `name IfElseBoth;
storage { [0] r: uint256; [1] flag: uint256; }
create { flag = 0; }
code {
  let x = 7;
  let y = 1;
  if (flag > 0) { y = 2; x = x + y; }
  else { y = 3; x = x * y; }
  r = x + y;
}`,
    locals: {
      x: { values: [7n, { value: 21n, after: "x = x * y" }] },
      y: { values: [1n, { value: 3n, after: "y = 3" }] },
    },
  },
  {
    name: "reassigned in a function",
    source: `name Reassign;
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
code { r = g(7); }`,
    locals: {
      n: { values: [7n] },
      keep: { values: [7n] },
      x: { values: [111n, { value: 222n, after: "x = 222" }] },
    },
  },
  {
    name: "loop",
    source: `name Loop;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 4; }
code {
  let acc = 0;
  for (let i = 0; i < s; i = i + 1) {
    acc = acc + i;
  }
  r = acc;
}`,
    locals: {
      acc: {
        values: [
          0n,
          ...[0n, 1n, 3n, 6n].map((value) => ({
            value,
            after: "acc = acc + i",
          })),
        ],
      },
      i: {
        values: [
          0n,
          ...[1n, 2n, 3n, 4n].map((value) => ({ value, after: "i = i + 1" })),
        ],
      },
    },
  },
  {
    name: "a let in a loop shadows a local",
    source: `name LoopShadow;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 2; }
code {
  let x = 1;
  for (let i = 0; i < s; i = i + 1) {
    let x = 50 + i;
    r = r + x;
  }
  r = r + x;
}`,
    locals: {
      "x@x = 1": { values: [1n] },
      "x@x = 50": {
        values: [50n, 51n].map((value) => ({ value, after: "x = 50 + i" })),
      },
      i: {
        values: [
          0n,
          ...[1n, 2n].map((value) => ({ value, after: "i = i + 1" })),
        ],
      },
    },
  },
  {
    name: "a folded version, then a located one",
    source: `name Folded;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 9; }
code {
  let x = 7;
  r = x;
  x = s;
  r = r + x;
}`,
    // At O1 and up, x = 7 is folded into its use; x = s still has a
    // value to point to
    locals: {
      x: { values: [7n, { value: 9n, after: "x = s" }], everyLevel: true },
    },
  },
  {
    name: "a loop that swaps two locals",
    source: `name Swap;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code {
  let a = 1;
  let b = 2;
  for (let i = 0; i < s; i = i + 1) {
    let t = a;
    a = b;
    b = t;
    r = r + t;
  }
  r = a * 10 + b;
}`,
    locals: {
      a: { values: [1n, 2n, 1n, 2n] },
      b: { values: [2n, 1n, 2n, 1n] },
      t: { values: [1n, 2n, 1n] },
      i: {
        values: [
          0n,
          ...[1n, 2n, 3n].map((value) => ({ value, after: "i = i + 1" })),
        ],
      },
    },
  },
  {
    name: "two lets of one name in one scope",
    source: `name Redeclare;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 4; }
code {
  let x = s + 1;
  r = x;
  let x = s + 2;
  r = r + x;
}`,
    locals: {
      "x@x = s + 1": { values: [5n] },
      "x@x = s + 2": { values: [6n] },
    },
  },
  {
    name: "a local aliased after the statement that computes it",
    source: `name Early;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code { let y = s; let x = y * 2; y = x; r = y; }`,
    locals: {
      y: { values: [3n, { value: 6n, after: "r = y" }] },
      x: { values: [6n] },
    },
  },
  {
    name: "an inlined function's local aliased after its statement",
    source: `name EarlyInline;
define {
  function f(y: uint256) -> uint256 {
    let x = y * 2;
    y = x;
    return y + 1;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code { let y = s; r = f(y); r = r + y; }`,
    locals: {
      "y@y: uint256": { values: [3n, { value: 6n, after: "return y + 1" }] },
      "y@y = s": { values: [3n] },
      x: { values: [6n] },
    },
  },
  {
    name: "locals that alias each other",
    source: `name Cp;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code { let a = s; let b = a; let c = b; r = c + a; }`,
    locals: {
      a: { values: [3n] },
      b: { values: [3n] },
      c: { values: [3n] },
    },
  },
  {
    name: "a local hides a storage variable",
    source: `name Coll;
storage { [0] r: uint256; [1] x: uint256; }
create { x = 5; }
code { let x = 7; r = x; r = r + 1; }`,
    locals: { x: { values: [7n] } },
  },
  {
    name: "a local beside a storage struct",
    source: `name StructStor;
define { struct P { a: uint128; b: uint128; }; }
storage { [0] r: uint256; [1] p: P; }
create { p.b = 3; }
code { let a = 7; r = a + p.b; r = r + a; }`,
    locals: { a: { values: [7n] } },
  },
  {
    name: "a parameter hides a storage variable",
    source: `name ParamStor;
define {
  function setOwner(owner: uint256) -> uint256 {
    let o = owner;
    if (o > 100) { return 0; }
    return o + owner;
  };
}
storage { [0] r: uint256; [1] owner: uint256; }
create { owner = 9; }
code { r = setOwner(4); }`,
    locals: { owner: { values: [4n] }, o: { values: [4n] } },
  },
  {
    name: "a parameter named frame",
    source: `name FrameParam;
define {
  function f(frame: uint256) -> uint256 {
    if (frame > 100) { return 0; }
    return frame + 1;
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(4); }`,
    locals: { frame: { values: [4n] } },
  },
  {
    name: "a callee's locals until its frame is torn down",
    source: `name Teardown;
define {
  function weight(x: uint256, w: uint256) -> uint256 {
    return x * w;
  };
}
storage { [0] r: uint256; }
create {}
code { r = weight(21, 2); }`,
    locals: { x: { values: [21n] }, w: { values: [2n] } },
  },
  {
    name: "calls",
    source: `name Calls;
define {
  function add(a: uint256, b: uint256) -> uint256 {
    let sum = a + b;
    return sum;
  };
  function twice(c: uint256) -> uint256 {
    let d = c + c;
    if (c > 100) { return 0; }
    return d;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code {
  let m = s;
  let k = add(m, 2);
  r = twice(k) + m;
}`,
    locals: {
      a: { values: [5n] },
      b: { values: [2n] },
      sum: { values: [7n] },
      c: { values: [7n] },
      d: { values: [14n] },
      m: { values: [5n] },
      k: { values: [7n] },
    },
  },
  {
    name: "a void call",
    source: `name VoidCall;
define {
  function put(a: uint256) {
    let b = a * 3;
    r = b;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code {
  let m = s + 1;
  put(m);
  s = m + r;
}`,
    locals: {
      a: { values: [6n] },
      b: { values: [18n] },
      m: { values: [6n] },
    },
  },
  {
    name: "one-armed if in a function",
    source: `name PickFn;
define {
  function pick(c: uint256) -> uint256 {
    let x = 1;
    if (c > 2) { x = c; }
    return x;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code { r = pick(s); }`,
    locals: {
      c: { values: [5n] },
      // `x = c` emits no code, so it cannot mark when 5 is due
      x: { values: [1n, 5n] },
    },
  },
  {
    name: "two inlinable calls",
    source: `name TwoCalls;
define {
  function inc(v: uint256) -> uint256 {
    let w = v + 1;
    return w;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code {
  let p = inc(s);
  let q = inc(p + 10);
  r = p + q;
}`,
    locals: {
      v: { values: [5n, 16n] },
      w: { values: [6n, 17n] },
      p: { values: [6n] },
      q: { values: [17n] },
    },
  },
  {
    name: "loop calling a function",
    source: `name LoopCall;
define {
  function sq(u: uint256) -> uint256 {
    return u * u;
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code {
  let total = 0;
  for (let j = 1; j <= s; j = j + 1) {
    total = total + sq(j);
  }
  r = total;
}`,
    locals: {
      total: { values: [0n, 1n, 5n, 14n] },
      j: { values: [1n, 2n, 3n, 4n] },
      u: { values: [1n, 2n, 3n] },
    },
  },
  {
    name: "tail recursion",
    source: `name TailSum;
define {
  function sumTo(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; }
    return sumTo(n - 1, acc + n);
  };
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code { r = sumTo(s, 0); }`,
    locals: {
      n: { values: [3n, 2n, 1n, 0n] },
      acc: { values: [0n, 3n, 5n, 6n] },
    },
    // A recursive call revisits a caller's values, so recursion fits
    // this check only once tail-call optimization makes it a loop
    levels: [2, 3],
  },
  ...kinds,
  {
    name: "two sub-word locals in one frame",
    source: `name Subwords;
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
code { r = f(0x00000000000000000000000000000000000000aA, true, 0); }`,
    locals: {
      ad: { values: [0xaan], size: 20 },
      z: { values: [0xaan], size: 20 },
      flag: { values: [1n], size: 1 },
      g: { values: [1n], size: 1 },
      m: { values: [0n] },
    },
  },
  {
    name: "array",
    source: `name Arr;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 2; }
code {
  let items: array<uint256> = [42, 12, 99];
  if (s > 1) { r = items[s]; }
  r = r + items.length;
}`,
    locals: { items: { shape: words, values: [[42n, 12n, 99n]] } },
  },
  {
    name: "nested array",
    source: `name Nested;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let m: array<array<uint256>> = [[1, 2], [3]];
  if (s > 0) { r = m[s][0]; }
  r = r + m.length;
}`,
    locals: {
      m: {
        shape: { kind: "array", element: words },
        values: [[[1n, 2n], [3n]]],
      },
    },
  },
  {
    name: "reassigned array",
    source: `name ReassignArr;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let items: array<uint256> = [5];
  if (s > 0) { items = [7, 8]; }
  r = items.length;
}`,
    locals: {
      items: {
        shape: words,
        values: [[5n], { value: [7n, 8n], after: "items = [7, 8]" }],
      },
    },
  },
  {
    name: "array elements written in a loop",
    source: `name WriteArr;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code {
  let items: array<uint256> = [0, 0, 0];
  for (let i = 0; i < s; i = i + 1) {
    items[i] = i * 10 + 1;
  }
  r = items[2];
}`,
    locals: {
      items: {
        shape: words,
        values: [
          [0n, 0n, 0n],
          ...[
            [1n, 0n, 0n],
            [1n, 11n, 0n],
            [1n, 11n, 21n],
          ].map((value) => ({ value, after: "items[i] = i * 10 + 1" })),
        ],
      },
      i: {
        values: [
          0n,
          ...[1n, 2n, 3n].map((value) => ({ value, after: "i = i + 1" })),
        ],
      },
    },
  },
  {
    name: "strings",
    source: `name Strings;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let short = "hello";
  let long = "hello world, this is longer than thirty-two bytes";
  if (s > 0) { r = short.length; }
  r = r + long.length;
}`,
    locals: {
      short: { shape: { kind: "bytes" }, values: [textBytes("hello")] },
      long: {
        shape: { kind: "bytes" },
        values: [
          textBytes("hello world, this is longer than thirty-two bytes"),
        ],
      },
    },
  },
  {
    // Storing a string copies its bytes in a loop, which holds
    // words of its own on the stack
    name: "strings stored to storage",
    source: `name StringStore;
storage { [0] r: uint256; [1] s: string; [2] t: string; }
create { r = 1; }
code {
  let n = r;
  let short = "hello";
  let long = "hello world, this is longer than thirty-two bytes";
  s = short;
  t = long;
  if (n > 0) { r = n + short.length + long.length; }
}`,
    locals: {
      n: { values: [1n] },
      short: { shape: { kind: "bytes" }, values: [textBytes("hello")] },
      long: {
        shape: { kind: "bytes" },
        values: [
          textBytes("hello world, this is longer than thirty-two bytes"),
        ],
      },
    },
  },
  {
    name: "bytes literal",
    source: `name BytesLit;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let data: bytes = 0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223;
  if (s > 0) { r = data.length; }
  r = r + 1;
}`,
    locals: {
      data: {
        shape: { kind: "bytes" },
        values: [
          "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223",
        ],
      },
    },
  },
  {
    name: "bytes slice",
    source: `name Slice;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let b = msg.data[0:0];
  if (s > 0) { r = b.length; }
  r = r + b.length;
}`,
    // Called with no calldata, so a longer slice would revert
    locals: { b: { shape: { kind: "bytes" }, values: ["0x"] } },
  },
  {
    // A slice longer than a word: its pointer reads every byte
    name: "a long bytes slice",
    source: `name LongSlice;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let data: bytes = 0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223;
  let b = data[1:35];
  if (s > 0) { r = b.length; }
  r = r + b.length;
}`,
    locals: {
      data: {
        shape: { kind: "bytes" },
        values: [
          "0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223",
        ],
      },
      b: {
        shape: { kind: "bytes" },
        values: [
          "0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122",
        ],
      },
    },
  },
  {
    name: "a uint8 cast",
    source: `name U8;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 300; }
code {
  let n = s;
  let m = n as uint8;
  if (s > 0) { r = m; }
}`,
    locals: { n: { values: [300n] }, m: { values: [44n], size: 1 } },
  },
  {
    // Narrowing casts truncate since #334, so `b` is `h`'s first four
    // bytes, right-aligned
    name: "a bytes4 cast",
    source: `name B4;
storage { [0] r: uint256; [1] s: uint256; }
create { s = 1; }
code {
  let h: bytes32 = 0x1122334400000000000000000000000000000000000000000000000000000000;
  let b = h as bytes4;
  if (b == 0x11223344) { r = 1; }
  r = r + 2;
}`,
    locals: {
      h: { values: [0x11223344n << 224n] },
      b: { values: [0x11223344n], size: 4 },
    },
  },
];

describe.each(levels)("locals hold the program's values at O%i", (level) => {
  it.each(programs.filter((p) => !p.levels || p.levels.includes(level)))(
    "$name",
    (program) => check(program, level),
  );
});

describe("variables before a function's first statement", () => {
  // Contexts are postconditions: the step after an instruction shows
  // its context. Every step lists the storage variable; from the
  // callee's entry JUMPDEST through its prologue, the parameters.
  const source = `name Prelude;
define {
  function add(a: uint256, b: uint256) -> uint256 {
    let c = a + b;
    return c;
  };
}
storage { [0] r: uint256; }
code { let x = 7; r = add(x, 3); }`;

  for (const level of [0, 1] as Level[]) {
    it(`lists variables at every step (O${level})`, async () => {
      const { steps, instructionAt } = await traceLocals(source, level);
      const unlisted = steps
        .map((_, i) => i)
        .filter(
          (i) =>
            i > 0 &&
            localsOf(instructionAt(steps[i - 1])?.context).length === 0,
        );
      expect(unlisted).toEqual([]);
    });

    it(`lists the parameters in the prologue (O${level})`, async () => {
      const { program } = await traceLocals(source, level);
      const at = program.instructions.findIndex(
        (instruction) =>
          instruction.operation?.mnemonic === "JUMPDEST" &&
          Program.Context.isInvoke(instruction.context),
      );
      // The entry JUMPDEST, then the prologue: the ops that map to the
      // whole function, before its body's
      const whole = codeOffset(program.instructions[at + 1].context);
      const rest = program.instructions.slice(at + 1);
      const prologue = [
        program.instructions[at],
        ...rest.slice(
          0,
          rest.findIndex(
            (instruction) => codeOffset(instruction.context) !== whole,
          ),
        ),
      ];
      expect(prologue.length).toBeGreaterThan(1);
      for (const instruction of prologue) {
        const names = localsOf(instruction.context).map((v) => v.identifier);
        expect(names, `pc ${instruction.offset}`).toEqual(
          expect.arrayContaining(["r", "a", "b"]),
        );
      }
    });
  }
});
