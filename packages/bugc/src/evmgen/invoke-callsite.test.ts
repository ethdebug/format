/**
 * The call-site source range is carried on the invoke/return
 * contexts of a function call, so a debugger stepping onto the
 * caller JUMP or the continuation JUMPDEST maps back to the call
 * expression (not just the callee's definition).
 */
import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import { Program } from "@ethdebug/format";
import type * as Format from "@ethdebug/format";

const { Context } = Program;

const source = `name Adder;
define {
  function add(a: uint256, b: uint256) -> uint256 { return a + b; };
}
storage { [0] r: uint256; }
create { r = 0; }
code { r = add(3, 4); }`;

async function runtimeProgram(): Promise<Format.Program> {
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level: 0 },
  });
  if (!result.success) throw new Error("compile failed");
  return result.value.bytecode.runtimeProgram;
}

function hasCodeRange(ctx: Record<string, unknown>): boolean {
  const code = ctx.code as { range?: { offset?: unknown; length?: unknown } };
  return (
    !!code &&
    typeof code.range?.offset === "number" &&
    typeof code.range?.length === "number"
  );
}

describe("call-site source range on invoke/return contexts", () => {
  it("the caller JUMP invoke context carries a call-site code range", async () => {
    const program = await runtimeProgram();
    const invokeJump = program.instructions.find(
      (i) =>
        i.operation?.mnemonic === "JUMP" &&
        i.context !== undefined &&
        Context.isInvoke(i.context),
    );
    expect(invokeJump, "invoke JUMP").toBeDefined();
    expect(hasCodeRange(invokeJump!.context as Record<string, unknown>)).toBe(
      true,
    );
  });

  it("the continuation JUMPDEST return context carries a call-site code range", async () => {
    const program = await runtimeProgram();
    const contJumpdest = program.instructions.find(
      (i) =>
        i.operation?.mnemonic === "JUMPDEST" &&
        i.context !== undefined &&
        Context.isReturn(i.context),
    );
    expect(contJumpdest, "continuation JUMPDEST").toBeDefined();
    expect(hasCodeRange(contJumpdest!.context as Record<string, unknown>)).toBe(
      true,
    );
  });

  it("still identifies the invoke by name and keeps behavior", async () => {
    const program = await runtimeProgram();
    const invokeJump = program.instructions.find(
      (i) =>
        i.operation?.mnemonic === "JUMP" &&
        i.context !== undefined &&
        Context.isInvoke(i.context),
    );
    const ctx = invokeJump!.context as Format.Program.Context.Invoke;
    expect(ctx.invoke.identifier).toBe("add");

    const res = await executeProgram(source, {
      calldata: "",
      optimizationLevel: 0,
    });
    expect(res.callSuccess).toBe(true);
    expect(await res.getStorage(0n)).toBe(7n);
  });
});
