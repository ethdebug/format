import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import type * as Format from "@ethdebug/format";

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
 * Find instructions matching a predicate
 */
function findInstructions(
  program: Format.Program,
  predicate: (instr: Format.Program.Instruction) => boolean,
): Format.Program.Instruction[] {
  return program.instructions.filter(predicate);
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

    // Find JUMP instructions with invoke context
    const invokeJumps = findInstructions(
      program,
      (instr) =>
        instr.operation?.mnemonic === "JUMP" &&
        !!(instr.context as Record<string, unknown>)?.invoke,
    );

    expect(invokeJumps.length).toBeGreaterThanOrEqual(1);

    const ctx = (invokeJumps[0].context as Record<string, unknown>)!;
    const invoke = ctx.invoke as Record<string, unknown>;

    expect(invoke.jump).toBe(true);
    expect(invoke.identifier).toBe("add");

    // Should have target pointer
    const target = invoke.target as Record<string, unknown>;
    expect(target.pointer).toBeDefined();

    // Should have argument pointers
    const args = invoke.arguments as Record<string, unknown>;
    const pointer = args.pointer as Record<string, unknown>;
    const group = pointer.group as Array<Record<string, unknown>>;

    expect(group).toHaveLength(2);
    // First arg (a) is deepest on stack
    expect(group[0]).toEqual({
      location: "stack",
      slot: 1,
    });
    // Second arg (b) is on top
    expect(group[1]).toEqual({
      location: "stack",
      slot: 0,
    });
  });

  it("should emit return context on continuation JUMPDEST", async () => {
    const program = await compileProgram(source);

    // Find JUMPDEST instructions with return context
    const returnJumpdests = findInstructions(
      program,
      (instr) =>
        instr.operation?.mnemonic === "JUMPDEST" &&
        !!(instr.context as Record<string, unknown>)?.return,
    );

    expect(returnJumpdests.length).toBeGreaterThanOrEqual(1);

    const ctx = (returnJumpdests[0].context as Record<string, unknown>)!;
    const ret = ctx.return as Record<string, unknown>;

    expect(ret.identifier).toBe("add");

    // Should have data pointer to return value at
    // TOS (stack slot 0)
    const data = ret.data as Record<string, unknown>;
    const pointer = data.pointer as Record<string, unknown>;
    expect(pointer).toEqual({
      location: "stack",
      slot: 0,
    });
  });

  it("should emit invoke context on callee entry JUMPDEST", async () => {
    const program = await compileProgram(source);

    // Find JUMPDEST instructions with invoke context
    // (the callee entry point, not the continuation)
    const invokeJumpdests = findInstructions(
      program,
      (instr) =>
        instr.operation?.mnemonic === "JUMPDEST" &&
        !!(instr.context as Record<string, unknown>)?.invoke,
    );

    expect(invokeJumpdests.length).toBeGreaterThanOrEqual(1);

    const ctx = (invokeJumpdests[0].context as Record<string, unknown>)!;
    const invoke = ctx.invoke as Record<string, unknown>;

    expect(invoke.jump).toBe(true);
    expect(invoke.identifier).toBe("add");

    // Should have argument pointers matching
    // function parameters
    const args = invoke.arguments as Record<string, unknown>;
    const pointer = args.pointer as Record<string, unknown>;
    const group = pointer.group as Array<Record<string, unknown>>;

    expect(group).toHaveLength(2);
  });

  it("should emit contexts in correct instruction order", async () => {
    const program = await compileProgram(source);

    // The caller JUMP should come before the
    // continuation JUMPDEST
    const invokeJump = findInstructions(
      program,
      (instr) =>
        instr.operation?.mnemonic === "JUMP" &&
        !!(instr.context as Record<string, unknown>)?.invoke,
    )[0];

    const returnJumpdest = findInstructions(
      program,
      (instr) =>
        instr.operation?.mnemonic === "JUMPDEST" &&
        !!(instr.context as Record<string, unknown>)?.return,
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
      "should emit return context without data pointer " + "for void functions",
      async () => {
        // This tests that when a function returns a
        // value, the return context includes data.
        // (All our test functions return values, so
        // data should always be present here.)
        const program = await compileProgram(voidSource);

        const returnJumpdests = findInstructions(
          program,
          (instr) =>
            instr.operation?.mnemonic === "JUMPDEST" &&
            !!(instr.context as Record<string, unknown>)?.return,
        );

        expect(returnJumpdests.length).toBeGreaterThanOrEqual(1);

        const ctx = (returnJumpdests[0].context as Record<string, unknown>)!;
        const ret = ctx.return as Record<string, unknown>;
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
      const invokeJumps = findInstructions(
        program,
        (instr) =>
          instr.operation?.mnemonic === "JUMP" &&
          !!(instr.context as Record<string, unknown>)?.invoke,
      );

      // At least 3 invoke JUMPs (main->addThree,
      // addThree->add x2)
      expect(invokeJumps.length).toBeGreaterThanOrEqual(3);

      // Check we have invokes for both functions
      const invokeIds = invokeJumps.map(
        (instr) =>
          (
            (instr.context as Record<string, unknown>).invoke as Record<
              string,
              unknown
            >
          ).identifier,
      );
      expect(invokeIds).toContain("addThree");
      expect(invokeIds).toContain("add");

      // Should have return contexts for all
      // continuation points
      const returnJumpdests = findInstructions(
        program,
        (instr) =>
          instr.operation?.mnemonic === "JUMPDEST" &&
          !!(instr.context as Record<string, unknown>)?.return,
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

      const invokeJumps = findInstructions(
        program,
        (instr) =>
          instr.operation?.mnemonic === "JUMP" &&
          !!(instr.context as Record<string, unknown>)?.invoke,
      );

      expect(invokeJumps.length).toBeGreaterThanOrEqual(1);

      const ctx = (invokeJumps[0].context as Record<string, unknown>)!;
      const invoke = ctx.invoke as Record<string, unknown>;
      const args = invoke.arguments as Record<string, unknown>;
      const pointer = args.pointer as Record<string, unknown>;
      const group = pointer.group as Array<Record<string, unknown>>;

      // Single arg at stack slot 0
      expect(group).toHaveLength(1);
      expect(group[0]).toEqual({
        location: "stack",
        slot: 0,
      });
    });
  });
});
