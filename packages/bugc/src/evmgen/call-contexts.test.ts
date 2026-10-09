import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import type * as Format from "@ethdebug/format";
import { Pointer, Program } from "@ethdebug/format";
import { dereference } from "@ethdebug/pointers";
import { traceLocals } from "#test/evm/locals";

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

  it(
    "should emit invoke context on caller JUMP " +
      "(identity, code target and args)",
    async () => {
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
      expect(invoke.declaration).toBeDefined();
      expect(invoke.declaration!.source).toEqual({ id: "0" });
      expect(invoke.declaration!.range).toBeDefined();
      expect(typeof invoke.declaration!.range!.offset).toBe("number");
      expect(typeof invoke.declaration!.range!.length).toBe("number");

      // Target should be a code pointer (not stack)
      expect(call.target).toBeDefined();
      expect(Pointer.Region.isCode(call.target!.pointer)).toBe(true);

      // The JUMP's invoke opens the frame, so it names the
      // arguments too: the JUMP leaves them on the stack, where the
      // callee's entry JUMPDEST (which does not change the stack)
      // finds them
      expect(call.arguments).toBeDefined();
      expect(call.arguments!.pointer).toEqual({
        group: [
          { name: "a", location: "stack", slot: 1 },
          { name: "b", location: "stack", slot: 0 },
        ],
      });
    },
  );

  it("should give the caller JUMP's arguments their values", async () => {
    const { steps, stateAt, instructionAt } = await traceLocals(source);

    const index = steps.findIndex((step) => {
      const instruction = instructionAt(step);
      return (
        instruction?.operation?.mnemonic === "JUMP" &&
        Context.isInvoke(instruction.context)
      );
    });
    expect(index).toBeGreaterThanOrEqual(0);

    // Contexts are postconditions: read the JUMP's pointers against
    // the state after it, at the callee's entry JUMPDEST
    const { invoke } = instructionAt(steps[index])!
      .context as Format.Program.Context.Invoke;
    const state = stateAt(index + 1);
    const cursor = await dereference(
      (invoke as InternalCall).arguments!.pointer,
      { state },
    );
    const view = await cursor.view(state);
    const values = await Promise.all(
      ["a", "b"].map(async (name) =>
        (await view.read(view.regions.lookup[name])).asUint(),
      ),
    );
    expect(values).toEqual([10n, 20n]);
  });

  it("should emit return context on the callee's exit JUMP", async () => {
    const program = await compileProgram(source);

    const returnJumps = findInstructionsWithContext(
      program,
      "JUMP",
      Context.isReturn,
    );

    expect(returnJumps.length).toBeGreaterThanOrEqual(1);

    const { return: ret } = returnJumps[0].context;

    expect(ret.identifier).toBe("add");

    // Should have declaration source range
    expect(ret.declaration).toBeDefined();
    expect(ret.declaration!.source).toEqual({ id: "0" });

    // Should have data pointer to return value at
    // TOS (stack slot 0)
    expect(ret.data).toBeDefined();
    expect(ret.data!.pointer).toEqual({
      location: "stack",
      slot: 0,
    });
  });

  it("should emit no return context on the continuation JUMPDEST", async () => {
    const program = await compileProgram(source);

    expect(
      findInstructionsWithContext(program, "JUMPDEST", Context.isReturn),
    ).toHaveLength(0);
  });

  it(
    "should emit invoke context on callee entry " +
      "JUMPDEST with args and code target",
    async () => {
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

      // Target should be a code pointer
      expect(call.target).toBeDefined();
      expect(Pointer.Region.isCode(call.target!.pointer)).toBe(true);

      // Should have argument pointers matching
      // function parameters
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
    },
  );

  it("should emit contexts in correct instruction order", async () => {
    const program = await compileProgram(source);

    // The caller JUMP should come before the
    // callee's exit JUMP
    const invokeJump = findInstructionsWithContext(
      program,
      "JUMP",
      Context.isInvoke,
    )[0];

    const returnJump = findInstructionsWithContext(
      program,
      "JUMP",
      Context.isReturn,
    )[0];

    expect(invokeJump).toBeDefined();
    expect(returnJump).toBeDefined();

    // Invoke JUMP offset should be less than
    // return JUMP offset (caller comes first
    // in bytecode)
    expect(Number(invokeJump.offset)).toBeLessThan(Number(returnJump.offset));
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

        const returnJumps = findInstructionsWithContext(
          program,
          "JUMP",
          Context.isReturn,
        );

        expect(returnJumps.length).toBeGreaterThanOrEqual(1);

        const { return: ret } = returnJumps[0].context;
        expect(ret.identifier).toBe("setVal");
        // Since setVal returns a value, data should
        // be present
        expect(ret.data).toBeDefined();
      },
    );

    it(
      "should emit invoke and data-free return contexts " +
        "for a void function called as a statement",
      async () => {
        const program = await compileProgram(`name VoidStatement;
define {
  function bump() { count = count + 1; };
}
storage { [0] count: uint256; }
create { count = 0; }
code { bump(); }`);

        const invokeJumps = findInstructionsWithContext(
          program,
          "JUMP",
          Context.isInvoke,
        );
        expect(invokeJumps).toHaveLength(1);
        expect(invokeJumps[0].context.invoke.identifier).toBe("bump");

        const returnJumps = findInstructionsWithContext(
          program,
          "JUMP",
          Context.isReturn,
        );
        expect(returnJumps).toHaveLength(1);
        const { return: ret } = returnJumps[0].context;
        expect(ret.identifier).toBe("bump");
        expect(ret.data).toBeUndefined();
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

      // Should have return contexts on both
      // functions' exit JUMPs
      const returnJumps = findInstructionsWithContext(
        program,
        "JUMP",
        Context.isReturn,
      );

      const returnIds = returnJumps.map(
        (instr) => instr.context.return.identifier,
      );
      expect(returnIds).toContain("addThree");
      expect(returnIds).toContain("add");
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

    it(
      "should emit single-element argument group " + "on callee JUMPDEST",
      async () => {
        const program = await compileProgram(singleArgSource);

        // Args are on the callee JUMPDEST, not the
        // caller JUMP
        const invokeJumpdests = findInstructionsWithContext(
          program,
          "JUMPDEST",
          Context.isInvoke,
        );

        expect(invokeJumpdests.length).toBeGreaterThanOrEqual(1);

        const { invoke } = invokeJumpdests[0].context;
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
      },
    );
  });

  describe("return epilogue source maps", () => {
    it(
      "should map return epilogue instructions " + "to source location",
      async () => {
        const program = await compileProgram(source);

        // The return epilogue is PUSH/MLOAD/JUMP inside
        // user functions. Find JUMP instructions that are
        // NOT invoke contexts — these are return jumps.
        const returnJumps = program.instructions.filter(
          (instr) =>
            instr.operation?.mnemonic === "JUMP" &&
            !Context.isInvoke(instr.context),
        );

        // Should have at least one return JUMP (from add)
        expect(returnJumps.length).toBeGreaterThanOrEqual(1);

        // The return JUMP should have a code context with
        // source location (not just a remark)
        const returnJump = returnJumps[0];
        expect(returnJump.context).toBeDefined();
        const ctx = returnJump.context as Record<string, unknown>;
        expect(ctx.code).toBeDefined();
        const code = ctx.code as Record<string, unknown>;
        expect(code.source).toEqual({ id: "0" });
        expect(code.range).toBeDefined();
      },
    );
  });
});
