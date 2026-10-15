/**
 * Every call a run enters, it leaves: replaying a trace's invoke and
 * return contexts, each `return` closes the innermost open `invoke`
 * of the same function, and no call is open when the run ends.
 *
 * An invoke on an instruction that runs off the call's path (one the
 * optimizer shares between paths, or hoists above the branch) opens
 * a call that never returns.
 */
import { describe, it, expect } from "vitest";
import { Program } from "@ethdebug/format";
import type * as Format from "@ethdebug/format";
import { traceLocals, type Level } from "#test/evm/locals";

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
// by reading the call's data, as the dispatch does before it branches.
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
});
