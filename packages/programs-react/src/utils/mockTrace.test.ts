/**
 * Tests for trace context extraction, transform (tailcall)
 * detection, and call-stack construction.
 */

import { describe, it, expect } from "vitest";
import type { Program } from "@ethdebug/format";
import {
  extractTransformFromInstruction,
  extractCallInfoFromInstruction,
  buildCallStack,
  buildPcToInstructionMap,
  type TraceStep,
} from "./mockTrace.js";

/** Build a minimal instruction with a context at an offset. */
function instr(offset: number, context: unknown): Program.Instruction {
  return {
    offset,
    operation: { mnemonic: "JUMPDEST", arguments: [] },
    context,
  } as unknown as Program.Instruction;
}

describe("extractTransformFromInstruction", () => {
  it("returns identifiers from a direct transform context", () => {
    const i = instr(0, { transform: ["tailcall"] });
    expect(extractTransformFromInstruction(i)).toEqual(["tailcall"]);
  });

  it("finds transform identifiers nested inside a gather", () => {
    const i = instr(0, {
      gather: [
        { return: { identifier: "sum" } },
        { invoke: { jump: true, identifier: "sum" } },
        { transform: ["tailcall"] },
      ],
    });
    expect(extractTransformFromInstruction(i)).toEqual(["tailcall"]);
  });

  it("collects multiple identifiers across nested contexts", () => {
    const i = instr(0, {
      gather: [{ transform: ["inline"] }, { transform: ["tailcall"] }],
    });
    expect(extractTransformFromInstruction(i).sort()).toEqual([
      "inline",
      "tailcall",
    ]);
  });

  it("returns an empty array when no transform is present", () => {
    const i = instr(0, { invoke: { jump: true, identifier: "sum" } });
    expect(extractTransformFromInstruction(i)).toEqual([]);
  });
});

describe("extractCallInfoFromInstruction tailcall flag", () => {
  it("marks isTailCall when a tailcall transform is present", () => {
    const i = instr(0, {
      gather: [
        { return: { identifier: "sum" } },
        { invoke: { jump: true, identifier: "sum" } },
        { transform: ["tailcall"] },
      ],
    });
    const info = extractCallInfoFromInstruction(i);
    expect(info?.isTailCall).toBe(true);
  });

  it("leaves isTailCall falsy for a plain invoke", () => {
    const i = instr(0, { invoke: { jump: true, identifier: "sum" } });
    const info = extractCallInfoFromInstruction(i);
    expect(info?.isTailCall).toBeFalsy();
  });
});

describe("buildCallStack TCO frame replacement", () => {
  const trace: TraceStep[] = [
    { pc: 0, opcode: "JUMPDEST" }, // entry invoke → push sum
    { pc: 10, opcode: "JUMP" }, // TCO back-edge → replace frame
  ];

  const program = {
    instructions: [
      instr(0, { invoke: { jump: true, identifier: "sum" } }),
      instr(10, {
        gather: [
          { return: { identifier: "sum" } },
          { invoke: { jump: true, identifier: "sum" } },
          { transform: ["tailcall"] },
        ],
      }),
    ],
  } as unknown as Program;

  const pcToInstruction = buildPcToInstructionMap(program);

  it("keeps the stack depth stable across a tail call", () => {
    const stack = buildCallStack(trace, pcToInstruction, 1);
    // Without the fix, the return-first gather pops to empty.
    expect(stack).toHaveLength(1);
  });

  it("replaces the top frame and marks it as a tail call", () => {
    const stack = buildCallStack(trace, pcToInstruction, 1);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].isTailCall).toBe(true);
    expect(stack[0].stepIndex).toBe(1);
  });

  it("does not mark a normal (pre-tailcall) frame", () => {
    const stack = buildCallStack(trace, pcToInstruction, 0);
    expect(stack).toHaveLength(1);
    expect(stack[0].isTailCall).toBeFalsy();
  });
});

// The compiler (bugc #217) emits the TCO back-edge as a
// single FLAT context object carrying return + invoke +
// transform keys together (not a gather). This is the
// actual production shape, so it needs direct coverage.
describe("flat (production) TCO back-edge shape", () => {
  const flatBackEdge = {
    return: { identifier: "sum" },
    invoke: {
      jump: true,
      identifier: "sum",
      target: { pointer: { location: "code", offset: 0, length: 1 } },
    },
    transform: ["tailcall"],
  };

  it("extracts the tailcall transform from the flat object", () => {
    expect(extractTransformFromInstruction(instr(0, flatBackEdge))).toEqual([
      "tailcall",
    ]);
  });

  it("marks isTailCall on the flat back-edge", () => {
    const info = extractCallInfoFromInstruction(instr(0, flatBackEdge));
    expect(info?.isTailCall).toBe(true);
  });

  it("replaces the frame in place for a flat back-edge", () => {
    const trace: TraceStep[] = [
      { pc: 0, opcode: "JUMPDEST" },
      { pc: 10, opcode: "JUMP" },
    ];
    const program = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "sum" } }),
        instr(10, flatBackEdge),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    const stack = buildCallStack(trace, pcToInstruction, 1);
    expect(stack).toHaveLength(1);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].isTailCall).toBe(true);
    expect(stack[0].callType).toBe("internal");
  });

  it("loses tail-call handling when the marker is stripped", () => {
    // Guards the task #10 failure mode: with the transform
    // marker gone, the flat {return, invoke} back-edge is
    // treated as a plain invoke — the frame-replacement path
    // never runs, so no frame is flagged as a tail call and
    // the widget can no longer render it as a frame reuse.
    const stripped = {
      return: { identifier: "sum" },
      invoke: { jump: true, identifier: "sum" },
    };
    const trace: TraceStep[] = [
      { pc: 0, opcode: "JUMPDEST" },
      { pc: 10, opcode: "JUMP" },
    ];
    const program = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "sum" } }),
        instr(10, stripped),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    const stack = buildCallStack(trace, pcToInstruction, 1);
    expect(stack.some((f) => f.isTailCall)).toBe(false);
  });
});

// Inlined internal calls (level-2 `inline` transform) produce
// VIRTUAL activations, not real ones. The compiler brackets an
// inlined body with a virtual invoke on the entry-first
// instruction and a virtual return on the exit-last instruction;
// every inlined instruction carries transform:["inline"]. The
// call stack must reconstruct the virtual frame, tag it, and
// tear it down when execution leaves the inlined body — so it
// reads distinctly from a real call and never leaks a phantom
// frame into caller code.
describe("inline virtual activations", () => {
  const entryInvoke = {
    code: { source: { id: "0" }, range: { offset: 0, length: 1 } },
    transform: ["inline"],
    invoke: { jump: true, identifier: "dbl" },
  };
  const bodyMark = {
    code: { source: { id: "0" }, range: { offset: 1, length: 1 } },
    transform: ["inline"],
  };
  const exitReturn = {
    code: { source: { id: "0" }, range: { offset: 2, length: 1 } },
    transform: ["inline"],
    return: { identifier: "dbl" },
  };
  const callerMark = {
    code: { source: { id: "0" }, range: { offset: 3, length: 1 } },
  };

  describe("extractCallInfoFromInstruction inline flag", () => {
    it("marks isInline on a virtual (inline) invoke", () => {
      const info = extractCallInfoFromInstruction(instr(0, entryInvoke));
      expect(info?.kind).toBe("invoke");
      expect(info?.isInline).toBe(true);
    });

    it("marks isInline on a virtual (inline) return", () => {
      const info = extractCallInfoFromInstruction(instr(0, exitReturn));
      expect(info?.kind).toBe("return");
      expect(info?.isInline).toBe(true);
    });

    it("leaves isInline falsy for a plain (real) invoke", () => {
      const info = extractCallInfoFromInstruction(
        instr(0, { invoke: { jump: true, identifier: "dbl" } }),
      );
      expect(info?.isInline).toBeFalsy();
    });
  });

  describe("buildCallStack virtual frame lifetime", () => {
    // A single inlined body: entry / body / exit / caller.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // entry invoke → push virtual dbl
      { pc: 1, opcode: "ADD" }, // inlined body instruction
      { pc: 2, opcode: "MSTORE" }, // exit return → pop
      { pc: 3, opcode: "JUMPDEST" }, // caller code (no inline marker)
    ];
    const program = {
      instructions: [
        instr(0, entryInvoke),
        instr(1, bodyMark),
        instr(2, exitReturn),
        instr(3, callerMark),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("pushes a virtual frame tagged isInline at the entry", () => {
      const stack = buildCallStack(trace, pcToInstruction, 0);
      expect(stack).toHaveLength(1);
      expect(stack[0].identifier).toBe("dbl");
      expect(stack[0].isInline).toBe(true);
    });

    it("keeps the virtual frame open across the inlined body", () => {
      const stack = buildCallStack(trace, pcToInstruction, 1);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
    });

    it("pops the virtual frame at the exit return", () => {
      const stack = buildCallStack(trace, pcToInstruction, 2);
      expect(stack).toHaveLength(0);
    });

    it("does not leak a phantom frame into caller code", () => {
      const stack = buildCallStack(trace, pcToInstruction, 3);
      expect(stack).toHaveLength(0);
    });
  });

  describe("two gap-separated inline sites of the same helper", () => {
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // site 1 entry
      { pc: 2, opcode: "MSTORE" }, // site 1 exit
      { pc: 3, opcode: "JUMPDEST" }, // caller gap (no inline)
      { pc: 10, opcode: "PUSH1" }, // site 2 entry
      { pc: 12, opcode: "MSTORE" }, // site 2 exit
      { pc: 13, opcode: "JUMPDEST" }, // caller
    ];
    const program = {
      instructions: [
        instr(0, entryInvoke),
        instr(2, exitReturn),
        instr(3, callerMark),
        instr(10, entryInvoke),
        instr(12, exitReturn),
        instr(13, callerMark),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("shows depth 1 while inside the second body", () => {
      const stack = buildCallStack(trace, pcToInstruction, 3);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
    });

    it("is empty after both sites — no accumulation", () => {
      const stack = buildCallStack(trace, pcToInstruction, 5);
      expect(stack).toHaveLength(0);
    });
  });

  describe("defensive membership guard", () => {
    // A virtual invoke whose exit return never arrives (residual
    // smear / dropped marker): the frame must still be torn down
    // when execution reaches a non-inline caller instruction,
    // rather than leaking to the end of the trace.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // virtual invoke → push
      { pc: 1, opcode: "ADD" }, // still inside the body
      { pc: 3, opcode: "JUMPDEST" }, // caller code, no inline marker
    ];
    const program = {
      instructions: [
        instr(0, entryInvoke),
        instr(1, bodyMark),
        instr(3, callerMark),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("keeps the frame while inline membership holds", () => {
      expect(buildCallStack(trace, pcToInstruction, 1)).toHaveLength(1);
    });

    it("force-pops a stale virtual frame at a non-inline instr", () => {
      expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(0);
    });
  });

  it("leaves a real call frame's isInline falsy", () => {
    const trace: TraceStep[] = [{ pc: 0, opcode: "JUMPDEST" }];
    const program = {
      instructions: [instr(0, { invoke: { jump: true, identifier: "f" } })],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);
    const stack = buildCallStack(trace, pcToInstruction, 0);
    expect(stack[0].isInline).toBeFalsy();
  });
});
