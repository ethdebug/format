import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import type * as Format from "@ethdebug/format";
import { Program } from "@ethdebug/format";

const { Context } = Program;
const { Invocation } = Context.Invoke;

type InternalCall = Format.Program.Context.Invoke.Invocation.InternalCall;

/**
 * Compile a BUG source and return the runtime program
 */
async function compileProgram(source: string): Promise<Format.Program> {
  const result = await compile({
    to: "bytecode",
    source,
  });

  if (!result.success) {
    const errors = result.messages.error ?? [];
    const msgs = errors
      .map((e: { message?: string }) => e.message ?? String(e))
      .join("\n");
    throw new Error(`Compilation failed:\n${msgs}`);
  }

  return result.value.bytecode.runtimeProgram;
}

/**
 * Find instructions with a given mnemonic whose context
 * satisfies a type guard
 */
function findInstructionsWithContext<C extends Format.Program.Context>(
  program: Format.Program,
  mnemonic: string,
  guard: (value: unknown) => value is C,
): (Format.Program.Instruction & { context: C })[] {
  return program.instructions.filter(
    (
      instr,
    ): instr is Format.Program.Instruction & {
      context: C;
    } => instr.operation?.mnemonic === mnemonic && guard(instr.context),
  );
}

describe("function call debug contexts", () => {
  const source = `name CallContextTest;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = add(10, 20);
}`;

  it("should emit invoke context on caller JUMP", async () => {
    const program = await compileProgram(source);

    const invokeJumps = findInstructionsWithContext(
      program,
      "JUMP",
      Context.isInvoke,
    );

    expect(invokeJumps.length).toBeGreaterThanOrEqual(1);

    const { invoke } = invokeJumps[0].context;
    expect(Invocation.isInternalCall(invoke)).toBe(true);

    const call = invoke as InternalCall;
    expect(call.jump).toBe(true);
    expect(call.identifier).toBe("add");

    // Should have declaration source range
    const decl = invoke.declaration as Record<string, unknown>;
    expect(decl).toBeDefined();
    expect(decl.source).toEqual({ id: "0" });
    expect(decl.range).toBeDefined();
    const range = decl.range as Record<string, unknown>;
    expect(typeof range.offset).toBe("number");
    expect(typeof range.length).toBe("number");

    // Should have target pointer
    expect(call.target.pointer).toBeDefined();

    // Should have argument pointers
    expect(call.arguments).toBeDefined();
    const group = (call.arguments!.pointer as { group: unknown[] }).group;

    expect(group).toHaveLength(2);
    // First arg (a) is deepest on stack
    expect(group[0]).toEqual({
      name: "a",
      location: "stack",
      slot: 1,
    });
    // Second arg (b) is on top
    expect(group[1]).toEqual({
      name: "b",
      location: "stack",
      slot: 0,
    });
  });

  it("should emit return context on continuation JUMPDEST", async () => {
    const program = await compileProgram(source);

    const returnJumpdests = findInstructionsWithContext(
      program,
      "JUMPDEST",
      Context.isReturn,
    );

    expect(returnJumpdests.length).toBeGreaterThanOrEqual(1);

    const { return: ret } = returnJumpdests[0].context;

    expect(ret.identifier).toBe("add");

    // Should have declaration source range
    const retDecl = ret.declaration as Record<string, unknown>;
    expect(retDecl).toBeDefined();
    expect(retDecl.source).toEqual({ id: "0" });

    // Should have data pointer to return value at
    // TOS (stack slot 0)
    expect(ret.data.pointer).toEqual({
      location: "stack",
      slot: 0,
    });
  });

  it("should emit invoke context on callee entry JUMPDEST", async () => {
    const program = await compileProgram(source);

    // The callee entry point, not the continuation
    const invokeJumpdests = findInstructionsWithContext(
      program,
      "JUMPDEST",
      Context.isInvoke,
    );

    expect(invokeJumpdests.length).toBeGreaterThanOrEqual(1);

    const { invoke } = invokeJumpdests[0].context;
    expect(Invocation.isInternalCall(invoke)).toBe(true);

    const call = invoke as InternalCall;
    expect(call.jump).toBe(true);
    expect(call.identifier).toBe("add");

    // Should have argument pointers matching
    // function parameters
    expect(call.arguments).toBeDefined();
    const group = (call.arguments!.pointer as { group: unknown[] }).group;

    expect(group).toHaveLength(2);
  });

  it("should emit contexts in correct instruction order", async () => {
    const program = await compileProgram(source);

    // The caller JUMP should come before the
    // continuation JUMPDEST
    const invokeJump = findInstructionsWithContext(
      program,
      "JUMP",
      Context.isInvoke,
    )[0];

    const returnJumpdest = findInstructionsWithContext(
      program,
      "JUMPDEST",
      Context.isReturn,
    )[0];

    expect(invokeJump).toBeDefined();
    expect(returnJumpdest).toBeDefined();

    // Invoke JUMP offset should be less than
    // return JUMPDEST offset (caller comes first
    // in bytecode)
    expect(Number(invokeJump.offset)).toBeLessThan(
      Number(returnJumpdest.offset),
    );
  });

  describe("void function calls", () => {
    const voidSource = `name VoidCallTest;

define {
  function setVal(
    s: uint256, v: uint256
  ) -> uint256 {
    return v;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = setVal(0, 42);
}`;

    it(
      "should emit return context with data pointer " +
        "for value-returning functions",
      async () => {
        const program = await compileProgram(voidSource);

        const returnJumpdests = findInstructionsWithContext(
          program,
          "JUMPDEST",
          Context.isReturn,
        );

        expect(returnJumpdests.length).toBeGreaterThanOrEqual(1);

        const { return: ret } = returnJumpdests[0].context;
        expect(ret.identifier).toBe("setVal");
        // Since setVal returns a value, data should
        // be present
        expect(ret.data).toBeDefined();
      },
    );
  });

  describe("nested function calls", () => {
    const nestedSource = `name NestedCallTest;

define {
  function add(
    a: uint256, b: uint256
  ) -> uint256 {
    return a + b;
  };
  function addThree(
    x: uint256, y: uint256, z: uint256
  ) -> uint256 {
    let sum1 = add(x, y);
    let sum2 = add(sum1, z);
    return sum2;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = addThree(1, 2, 3);
}`;

    it("should emit invoke/return contexts for " + "nested calls", async () => {
      const program = await compileProgram(nestedSource);

      // Should have invoke contexts for:
      // 1. main -> addThree
      // 2. addThree -> add (first call)
      // 3. addThree -> add (second call)
      // Plus callee entry JUMPDESTs
      const invokeJumps = findInstructionsWithContext(
        program,
        "JUMP",
        Context.isInvoke,
      );

      // At least 3 invoke JUMPs (main->addThree,
      // addThree->add x2)
      expect(invokeJumps.length).toBeGreaterThanOrEqual(3);

      // Check we have invokes for both functions
      const invokeIds = invokeJumps.map(
        (instr) => instr.context.invoke.identifier,
      );
      expect(invokeIds).toContain("addThree");
      expect(invokeIds).toContain("add");

      // Should have return contexts for all
      // continuation points
      const returnJumpdests = findInstructionsWithContext(
        program,
        "JUMPDEST",
        Context.isReturn,
      );

      expect(returnJumpdests.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("single-arg function", () => {
    const singleArgSource = `name SingleArgTest;

define {
  function double(x: uint256) -> uint256 {
    return x + x;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = double(7);
}`;

    it("should emit single-element argument group", async () => {
      const program = await compileProgram(singleArgSource);

      const invokeJumps = findInstructionsWithContext(
        program,
        "JUMP",
        Context.isInvoke,
      );

      expect(invokeJumps.length).toBeGreaterThanOrEqual(1);

      const { invoke } = invokeJumps[0].context;
      expect(Invocation.isInternalCall(invoke)).toBe(true);

      const call = invoke as InternalCall;
      expect(call.arguments).toBeDefined();
      const group = (call.arguments!.pointer as { group: unknown[] }).group;

      // Single arg at stack slot 0
      expect(group).toHaveLength(1);
      expect(group[0]).toEqual({
        name: "x",
        location: "stack",
        slot: 0,
      });
    });
  });
});
