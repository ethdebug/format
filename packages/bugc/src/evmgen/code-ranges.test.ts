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
import { hasCode } from "./generation/control-flow/terminator.js";

const { Context } = Program;

/** Whether a context starts an inlined call */
function invokesInline(context: Format.Program.Context | undefined): boolean {
  return !!context && invokes(context) && inlined(context);
}

/** Whether a context starts a call with no jump target (in a gather
 * too), as an inlined call's invoke has none */
function invokes(context: Format.Program.Context): boolean {
  return (
    (Context.isInvoke(context) && !("target" in context.invoke)) ||
    (Context.isGather(context) && context.gather.some(invokes))
  );
}

/** Whether a context is in an inlined body (in a gather too) */
function inlined(context: Format.Program.Context): boolean {
  return (
    (Context.isTransform(context) && context.transform.includes("inline")) ||
    (Context.isGather(context) && context.gather.some(inlined))
  );
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
    invokesInline(instructions[index + 1]?.context)
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

  it("give a block's JUMPDEST the range of what runs next", async () => {
    const source = `name Labels;
storage { [0] r: uint256; }
create {}
code {
  let n = r;
  if (n > 3) { r = n - 1; } else { r = n + 2; }
  for (let i = 0; i < n; i = i + 1) { r = r + i; }
}`;
    const result = await compile({
      to: "bytecode",
      source,
      optimizer: { level: 0 },
    });
    if (!result.success) throw new Error("compilation failed");
    const { instructions } = result.value.bytecode.runtimeProgram;
    const labels = instructions.flatMap(({ operation, context }, index) =>
      operation?.mnemonic === "JUMPDEST" ? [{ context, index }] : [],
    );
    expect(labels.length).toBeGreaterThan(2);
    for (const { context, index } of labels) {
      const next = instructions[index + 1].context;
      expect(hasCode(context)).toBe(true);
      expect((context as Format.Program.Context.Code).code).toEqual(
        (next as Format.Program.Context.Code).code,
      );
    }
  });

  it("give the end of a body with no return the function's", async () => {
    const source = `name End;
define {
  function g(n: uint256) { r = n; };
}
storage { [0] r: uint256; }
create {}
code { g(3); g(4); }`;
    for (const level of [0, 1] as const) {
      const result = await compile({
        to: "bytecode",
        source,
        optimizer: { level },
      });
      if (!result.success) throw new Error("compilation failed");
      const exits = result.value.bytecode.runtimeProgram.instructions.filter(
        ({ operation, context }) =>
          operation?.mnemonic === "JUMP" &&
          context &&
          Context.isReturn(context),
      );
      expect(exits.length).toBe(1);
      const { code, return: info } = exits[0]
        .context as Format.Program.Context.Code & Format.Program.Context.Return;
      expect(info.declaration).toBeDefined();
      expect(code).toEqual(info.declaration);
    }
  });
});
