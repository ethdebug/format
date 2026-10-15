/**
 * Every call a run enters, it leaves: replaying a trace's invoke and
 * return contexts, each `return` closes the innermost open `invoke`
 * of the same function, and no call is open when the run ends.
 *
 * An optimizer pass that removes or merges the instruction (or the
 * jump) that carries an invoke or a return must leave the marker on
 * that call's path, in order: on an instruction that also runs off the
 * path (one shared with another path), it opens a call that never
 * returns; lost with the instruction, it leaves the other unmatched.
 */
import { describe, it, expect } from "vitest";
import { Program } from "@ethdebug/format";
import type * as Format from "@ethdebug/format";
import { createHash } from "node:crypto";
import { compile } from "#compiler";
import { traceLocals, type Level } from "#test/evm/locals";
import { exampleSources } from "../examples/index.js";

const { Context } = Program;

/** A context's invoke and return identifiers, reaching into gathers */
function activations(context: Format.Program.Context | undefined): {
  invokes: { identifier: string; real: boolean }[];
  returns: string[];
} {
  const invokes: { identifier: string; real: boolean }[] = [];
  const returns: string[] = [];
  const visit = (c: Format.Program.Context) => {
    if (Context.isInvoke(c)) {
      invokes.push({
        identifier: c.invoke.identifier ?? "",
        real: "target" in c.invoke,
      });
    }
    if (Context.isReturn(c)) returns.push(c.return.identifier ?? "");
    if (Context.isGather(c)) c.gather.forEach(visit);
  };
  if (context) visit(context);
  return { invokes, returns };
}

/** The calls a run enters, and those still open at its end, failing
 * on a return that does not close the innermost open call */
async function runCalls(source: string, level: Level, calldata = "") {
  const { steps, instructionAt } = await traceLocals(source, level, calldata);
  const frames: { name: string; step: number; real: boolean }[] = [];
  const calls: string[] = [];
  steps.forEach((step, i) => {
    const { invokes, returns } = activations(instructionAt(step)?.context);
    for (const { identifier, real } of invokes) {
      // A real call's JUMP and its callee's entry JUMPDEST both
      // carry its invoke, on consecutive steps: count it once
      const top = frames.at(-1);
      if (real && top?.real && top.name === identifier && top.step === i - 1) {
        top.step = i;
        continue;
      }
      frames.push({ name: identifier, step: i, real });
      calls.push(identifier);
    }
    for (const identifier of returns) {
      expect(frames.pop()?.name, `return at pc ${step.pc}`).toBe(identifier);
    }
  });
  return { calls, open: frames.map(({ name }) => name) };
}

const selector = (n: number) => n.toString(16).padStart(8, "0");

// Two functions run by a dispatch, each on its own path. Both start
// by reading the call's data, as the dispatch does before it branches:
// that read goes, and with it the instruction that carried the invoke.
const dispatch = `name Dispatch;
define {
  function a() { r = msg.data[4:36] as bytes32 as uint256; };
  function b() { s = msg.data[4:36] as bytes32 as uint256 + 1; };
}
storage { [0] r: uint256; [1] s: uint256; }
create { r = 0; }
code {
  if (msg.data[0:4] as bytes4 == 0x00000001) { a(); return; }
  if (msg.data[0:4] as bytes4 == 0x00000002) { b(); return; }
}`;

const levels: Level[] = [0, 1, 2, 3];

// Each program, and the calls its run enters
const programs: {
  name: string;
  source: string;
  calls: string[];
  /** The call's selector (1 by default) */
  selector?: number;
}[] = [
  {
    // The body's last instruction goes (the caller read msg.sender
    // already): its return moves back onto the body's write
    name: "a body whose last instruction goes",
    source: `name MovedReturn;
define {
function f(n: uint256) -> address { r = n; return msg.sender; };
function g(n: uint256) { s = n + r; };
}
storage { [0] r: uint256; [1] s: uint256; [2] w: address; }
create { r = 0; }
code { let a = msg.sender; w = f(3); g(4); w = a; }`,
    calls: ["f", "g"],
  },
  {
    // The body's one instruction goes, and its block is left empty
    name: "a body that goes whole",
    source: `name Emptied;
define { function who() -> address { return msg.sender; }; }
storage { [0] w: address; [1] v: address; [2] u: address; }
create { w = msg.sender; }
code { let a = msg.sender; w = who(); v = who(); u = a; }`,
    calls: ["who", "who"],
  },
  {
    // At O3, f's body (one instruction, which goes) and g's share a
    // block: f's call must not end after g's begins
    name: "calls in sequence",
    source: `name Sequence;
define {
function f(n: uint256) -> uint256 { return n + 1; };
function g(m: uint256) { s = m; };
}
storage { [0] r: uint256; [1] s: uint256; [2] u: uint256; [3] a: uint256; }
create { a = 4; }
code { let b = a; if (b > 0) { let x = b + 1; g(f(b)); u = x; } }`,
    calls: ["f", "g"],
  },
  {
    name: "nested calls",
    source: `name Nested;
define {
function inner() -> uint256 {
  return msg.data[4:36] as bytes32 as uint256;
};
function outer() -> uint256 { return inner() + 1; };
}
storage { [0] r: uint256; }
create { r = 0; }
code { if (msg.data[0:4] as bytes4 == 0x00000001) { r = outer(); } }`,
    calls: ["outer", "inner"],
  },
  {
    // Both bodies start with a read of msg.data, which folds into the
    // dispatch's own, before the branch: a run that does not take the
    // branch enters neither
    name: "nested calls, not called",
    source: `name Nested;
define {
function inner() -> uint256 {
  return msg.data[4:36] as bytes32 as uint256;
};
function outer() -> uint256 { return inner() + 1; };
}
storage { [0] r: uint256; }
create { r = 0; }
code { if (msg.data[0:4] as bytes4 == 0x00000001) { r = outer(); } }`,
    calls: [],
    selector: 2,
  },
  {
    name: "a call in a loop",
    source: `name Loop;
define { function who() -> address { r = r + 1; return msg.sender; }; }
storage { [0] r: uint256; [1] w: address; }
create { r = 0; }
code {
let a = msg.sender;
for (let i = 0; i < 3; i = i + 1) { w = who(); }
w = a;
}`,
    calls: ["who", "who", "who"],
  },
  {
    // The body's last instruction is dead (its result is unused)
    name: "a call whose result is unused",
    source: `name Unused;
define { function g() -> uint256 { r = r + 1; return msg.value; }; }
storage { [0] r: uint256; }
create { r = 0; }
code { g(); }`,
    calls: ["g"],
  },
  {
    // At O3, the body's two writes merge into one
    name: "a body whose writes merge",
    source: `name Merged;
define {
struct P { a: uint64; b: uint64; };
function set() { p.a = 1; p.b = 2; };
}
storage { [0] p: P; [1] r: uint256; }
create { r = 0; }
code { set(); r = 9; }`,
    calls: ["set"],
  },
  {
    // Issue #382: the body's entry block is empty, and it jumps to a
    // loop header
    name: "a body that starts with a loop",
    source: `name LoopFirst;
define {
function f(n: uint256) -> uint256 {
  for (let i = n; i > 5; i = i - 1) {
    r = r + 1;
  }
  return n + 1;
};
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 9; }
code { let v = s; r = f(v) + v; }`,
    calls: ["f"],
  },
  {
    // Issue #382: the loop's exit block is empty
    name: "a body that ends with a loop",
    source: `name LoopLast;
define {
function f(n: uint256) -> uint256 {
  let acc = 0;
  for (let i = 0; i < n; i = i + 1) {
    acc = acc + i;
  }
  return acc;
};
}
storage { [0] r: uint256; [1] s: uint256; }
create { s = 3; }
code { r = f(s); }`,
    calls: ["f"],
  },
];

describe("every invoke is matched by its return", () => {
  for (const level of levels) {
    for (const [call, called] of [
      [1, ["a"]],
      [2, ["b"]],
      [3, []],
    ] as const) {
      it(`dispatch, selector ${call}, at O${level}`, async () => {
        const data = selector(call) + "0".repeat(63) + "7";
        const { calls, open } = await runCalls(dispatch, level, data);
        expect(calls).toEqual(called);
        expect(open).toEqual([]);
      });
    }
  }

  for (const level of levels) {
    for (const {
      name,
      source,
      calls: called,
      selector: call = 1,
    } of programs) {
      it(`${name}, at O${level}`, async () => {
        const data = selector(call) + "0".repeat(63) + "7";
        const { calls, open } = await runCalls(source, level, data);
        expect(calls).toEqual(called);
        expect(open).toEqual([]);
      });
    }
  }
});

// Debug information never changes the code: these digests are of the
// code `main` generated before invoke and return markers were moved
// (or dropped) rather than kept by keeping code. A change to the code
// generation that is meant changes them, too (`vitest -u`).
describe("the code does not depend on the markers", () => {
  it("is the same for every example and program here", async () => {
    const sources = {
      ...exampleSources,
      ...Object.fromEntries(programs.map(({ name, source }) => [name, source])),
      dispatch,
    };
    const digests: Record<string, string> = {};
    for (const [name, source] of Object.entries(sources)) {
      for (const level of levels) {
        const result = await compile({
          to: "bytecode",
          source,
          optimizer: { level },
        });
        digests[`${name} at O${level}`] = result.success
          ? createHash("sha256")
              .update(result.value.bytecode.runtime)
              .update(result.value.bytecode.create ?? new Uint8Array())
              .digest("hex")
          : "does not compile";
      }
    }
    expect(digests).toMatchSnapshot();
  });
});
