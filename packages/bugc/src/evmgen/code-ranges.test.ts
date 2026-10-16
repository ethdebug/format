/**
 * Every instruction has a source range, so a debugger stopped at any
 * of them has something to show: the instructions the compiler adds
 * (a called function's entry, a block's JUMPDEST, a return the source
 * does not write) get the range of what they belong to.
 */
import { describe, it, expect } from "vitest";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";
import { compile } from "#compiler";
import { exampleSources } from "../examples/index.js";

const { Context } = Program;

/** Whether a context gives a source range, in a gather or a pick too */
function hasCode(context: Format.Program.Context | undefined): boolean {
  if (!context) return false;
  if (Context.isCode(context)) return true;
  if (Context.isGather(context)) return context.gather.some(hasCode);
  if (Context.isPick(context)) return context.pick.some(hasCode);
  return false;
}

/** Whether a context starts a call, in a gather too */
function hasInvoke(context: Format.Program.Context | undefined): boolean {
  if (!context) return false;
  if (Context.isInvoke(context)) return true;
  return Context.isGather(context) && context.gather.some(hasInvoke);
}

/** Why an instruction has no source range, if it may have none */
function exception(
  instructions: Format.Program.Instruction[],
  index: number,
): string | undefined {
  const { operation, context } = instructions[index];
  const remark = context && Context.isRemark(context) ? context.remark : "";
  // The source has no `code` block: the runtime is the compiler's own
  if (remark === "initialize free memory pointer") return "no code block";
  // The create program's end: it returns the runtime code
  if (remark.startsWith("deployment:")) return "deployment";
  // A block that starts with an inlined call: the JUMPDEST is at the
  // call site, which the call's first instruction does not always give
  if (
    operation?.mnemonic === "JUMPDEST" &&
    hasInvoke(instructions[index + 1]?.context)
  ) {
    return "before an inlined call";
  }
  return undefined;
}

describe("source ranges", () => {
  it("are on every instruction of every example", async () => {
    const missing: string[] = [];
    for (const [name, source] of Object.entries(exampleSources)) {
      for (const level of [0, 1, 2, 3] as const) {
        const result = await compile({
          to: "bytecode",
          source,
          optimizer: { level },
        });
        if (!result.success) continue;
        const { runtimeProgram, createProgram } = result.value.bytecode;
        for (const program of [runtimeProgram, createProgram]) {
          const { instructions } = program ?? { instructions: [] };
          instructions.forEach(({ offset, context }, index) => {
            if (hasCode(context) || exception(instructions, index)) return;
            missing.push(`${name} at O${level}, offset ${offset}`);
          });
        }
      }
    }
    expect(missing).toEqual([]);
  }, 120_000);

  it("give a called function's entry its declaration", async () => {
    const source = `name Entry;
define {
  function f(n: uint256) -> uint256 {
    if (n > 0) { return n; }
    return f(n + 1);
  };
}
storage { [0] r: uint256; }
create {}
code { r = f(0); }`;
    for (const level of [0, 1, 2, 3] as const) {
      const result = await compile({
        to: "bytecode",
        source,
        optimizer: { level },
      });
      if (!result.success) throw new Error("compilation failed");
      const entries = result.value.bytecode.runtimeProgram.instructions.filter(
        ({ operation, context }) =>
          operation?.mnemonic === "JUMPDEST" &&
          context &&
          Context.isInvoke(context),
      );
      expect(entries.length).toBeGreaterThan(0);
      for (const { context } of entries) {
        const { code, invoke } = context as Format.Program.Context.Code &
          Format.Program.Context.Invoke;
        expect(code).toEqual((invoke as { declaration?: unknown }).declaration);
      }
    }
  });
});
