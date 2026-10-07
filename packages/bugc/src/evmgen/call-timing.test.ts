/**
 * Call frame timing, checked against real traces. Instruction
 * contexts are postconditions: the context of the instruction run
 * at step i-1 holds at step i. Replaying the invoke and return
 * contexts that way, a called function's frame must be on from the
 * step after the caller's JUMP (the callee's entry JUMPDEST) through
 * the step of the callee's exit JUMP, and off at the step after it
 * (the caller's continuation JUMPDEST). At that step, the exit's
 * `return` data pointer must read the returned value.
 */
import { describe, it, expect } from "vitest";
import { createMachineState } from "@ethdebug/evm";
import { dereference } from "@ethdebug/pointers";
import { Program } from "@ethdebug/format";
import type * as Format from "@ethdebug/format";
import { traceLocals, type Level } from "#test/evm/locals";

const { Context } = Program;

const programs = [
  {
    name: "nested calls and a function with two exits",
    source: `name Exits;
define {
  function add(a: uint256, b: uint256) -> uint256 { return a + b; };
  function pick(a: uint256) -> uint256 {
    if (a > 5) { return a; }
    return 99;
  };
  function addThree(a: uint256) -> uint256 { return add(add(a, 1), 2); };
}
storage { [0] r: uint256; [1] s: uint256; [2] t: uint256; [3] u: uint256; }
create { r = 0; }
code {
  r = add(10, 20);
  s = pick(7);
  t = pick(2);
  u = addThree(5);
}`,
    // The values each function returns, in order, at O0 (higher
    // levels inline some calls away)
    returns: [30n, 7n, 99n, 6n, 8n, 8n],
  },
  {
    name: "recursion",
    source: `name Recursion;
define {
  function fact(n: uint256) -> uint256 {
    if (n < 2) { return 1; }
    return n * fact(n - 1);
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = fact(4); }`,
    returns: [1n, 2n, 6n, 24n],
  },
  {
    // From O2, TCO turns count's self-call into a back-edge JUMP
    // that pops the old frame and pushes the new one at once, so
    // the frame depth stays constant. That JUMP carries a `return`
    // with no `data`: nothing is returned yet. The only value count
    // returns is its last one, from its real exit.
    name: "tail call",
    source: `name TailCall;
define {
  function succ(n: uint256) -> uint256 { return n + 1; };
  function count(n: uint256, target: uint256) -> uint256 {
    if (n < target) { return count(succ(n), target); }
    else { return n; }
  };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = count(0, 5); }`,
    // At O0: succ's five returns, then count's six, unwinding
    returns: [1n, 2n, 3n, 4n, 5n, 5n, 5n, 5n, 5n, 5n, 5n],
  },
];

/** A context's invoke and return leaves, outside inlined bodies */
function events(context: Format.Program.Context | undefined): {
  invoke?: string;
  return?: string;
} {
  if (!context) return {};
  if (Context.isTransform(context) && context.transform.includes("inline")) {
    return {};
  }
  return {
    ...(Context.isInvoke(context) ? { invoke: context.invoke.identifier } : {}),
    ...(Context.isReturn(context) ? { return: context.return.identifier } : {}),
  };
}

describe("call frame timing", () => {
  for (const { name, source, returns } of programs) {
    for (const level of [0, 1, 2, 3] as Level[]) {
      it(`${name} at O${level}`, async () => {
        const { program, executor, steps, instructionAt } = await traceLocals(
          source,
          level,
        );

        // Each function's body: from its entry JUMPDEST to the next
        // function's entry (bugc lays functions out one after another,
        // after the main code)
        const entries = program.instructions
          .filter(
            (instruction) =>
              instruction.operation?.mnemonic === "JUMPDEST" &&
              events(instruction.context).invoke !== undefined,
          )
          .map((instruction) => ({
            name: events(instruction.context).invoke!,
            offset: Number(instruction.offset),
          }))
          .sort((a, b) => a.offset - b.offset);
        const functionAt = (pc: number) =>
          entries.filter(({ offset }) => offset <= pc).at(-1)?.name;

        // Replay the frames by the postcondition rule. The caller's
        // JUMP and the callee's JUMPDEST both carry the invoke, on
        // consecutive steps: count it once.
        const frames: { name: string; step: number }[] = [];
        const read: bigint[] = [];
        let calls = 0;
        for (let i = 0; i < steps.length; i++) {
          if (i > 0) {
            const previous = instructionAt(steps[i - 1]);
            const { invoke, return: returned } = events(previous?.context);
            if (returned !== undefined && invoke !== undefined) {
              // A tail call's back-edge: the frame is reused
              frames[frames.length - 1] = { name: invoke, step: i };
            } else if (returned !== undefined) {
              expect(frames.pop()?.name).toBe(returned);
              const ret = (previous!.context as Format.Program.Context.Return)
                .return;
              if (ret.data) {
                const state = createMachineState(executor, {
                  traceStep: steps[i],
                });
                const cursor = await dereference(ret.data.pointer, { state });
                const view = await cursor.view(state);
                read.push((await view.read(view.regions[0])).asUint());
              }
            } else if (invoke !== undefined) {
              const top = frames[frames.length - 1];
              if (top?.name === invoke && top.step === i - 1) {
                top.step = i;
              } else {
                frames.push({ name: invoke, step: i });
                calls++;
              }
            }
          }

          // The innermost frame is the function whose code this
          // step runs: on at the callee's entry JUMPDEST, through
          // its exit JUMP, and off at the caller's continuation
          expect(
            frames[frames.length - 1]?.name,
            `step ${i} (pc ${steps[i].pc})`,
          ).toBe(functionAt(steps[i].pc));
        }

        // An exit with no `data` is never run. Bugc gives an if/else
        // whose branches both return an empty merge block, with an
        // implicit void return that nothing jumps to (O0 and O1; the
        // optimizer drops it from O2). A value-returning function
        // that runs off its end would reach such an exit, but the
        // functions here do not.
        const visited = new Set(steps.map(({ pc }) => pc));
        for (const instruction of program.instructions) {
          const { invoke, return: returned } = events(instruction.context);
          const ret = (instruction.context as Format.Program.Context.Return)
            ?.return;
          if (returned !== undefined && invoke === undefined && !ret.data) {
            expect(visited, `exit at ${instruction.offset}`).not.toContain(
              Number(instruction.offset),
            );
          }
        }

        expect(frames).toEqual([]);
        expect(read).toHaveLength(calls);
        if (level === 0) {
          expect(read).toEqual(returns);
        } else {
          for (const value of read) expect(returns).toContain(value);
        }
      });
    }
  }
});
