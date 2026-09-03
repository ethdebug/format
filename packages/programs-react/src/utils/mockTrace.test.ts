/**
 * Tests for trace context extraction, transform (tailcall)
 * detection, and call-stack construction — including the flat
 * tail-call back-edge shape: a single instruction that carries
 * both a `return` and an `invoke` context.
 *
 * Call-stack timing: instruction contexts are postconditions, so
 * the frame list at trace step i reflects the instructions
 * executed at steps 0..i-1. An invoke on the instruction at step
 * k opens its frame at step k+1; a return at step k is still shown
 * at step k+1 (close-after) and gone at step k+2.
 */

import { describe, it, expect } from "vitest";
import type { Program } from "@ethdebug/format";
import {
  extractTransformFromInstruction,
  extractCallInfoFromInstruction,
  extractCallEvents,
  buildCallStack,
  buildPcToInstructionMap,
  type TraceStep,
} from "./mockTrace.js";
import { effectiveContextForStep } from "./effectiveContext.js";

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
    { pc: 0, opcode: "JUMPDEST" }, // entry invoke (push at step 1)
    { pc: 10, opcode: "JUMP" }, // TCO back-edge (replace at step 2)
    { pc: 4, opcode: "JUMPDEST" }, // loop body
  ];

  const program = {
    instructions: [
      instr(0, { invoke: { jump: true, identifier: "sum" } }),
      instr(4, { code: {} }),
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
    const stack = buildCallStack(trace, pcToInstruction, 2);
    // Without the fix, the return-first gather pops to empty.
    expect(stack).toHaveLength(1);
  });

  it("replaces the top frame and marks it as a tail call", () => {
    const stack = buildCallStack(trace, pcToInstruction, 2);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].isTailCall).toBe(true);
    expect(stack[0].stepIndex).toBe(2);
  });

  it("does not mark a normal (pre-tailcall) frame", () => {
    const stack = buildCallStack(trace, pcToInstruction, 1);
    expect(stack).toHaveLength(1);
    expect(stack[0].isTailCall).toBeFalsy();
  });
});

describe("buildCallStack flat return+invoke back-edge", () => {
  // A self-recursive tail loop:
  //   pc 0  — entry, invoke `sum` (push a frame)
  //   pc 4  — loop body (no call context)
  //   pc 10 — back-edge JUMP: flat context carrying BOTH the
  //           previous iteration's `return` and the next
  //           iteration's `invoke` on one instruction (the
  //           shape bugc emits for a TCO-replaced tail call).
  const backEdge = instr(10, {
    return: { identifier: "sum" },
    invoke: { jump: true, identifier: "sum" },
  });

  const program = {
    instructions: [
      instr(0, { invoke: { jump: true, identifier: "sum" } }),
      instr(4, { code: {} }),
      backEdge,
    ],
  } as unknown as Program;

  const pcToInstruction = buildPcToInstructionMap(program);

  // Entry and back-edge are NOT consecutive steps, so the
  // caller-JUMP/callee-JUMPDEST dedup does not apply — this is
  // the arrangement that exposes the bug.
  const trace: TraceStep[] = [
    { pc: 0, opcode: "JUMPDEST" }, // step 0: entry (push at step 1)
    { pc: 4, opcode: "JUMPDEST" }, // step 1: loop body
    { pc: 10, opcode: "JUMP" }, // step 2: back-edge (reuse at step 3)
    { pc: 4, opcode: "JUMPDEST" }, // step 3: loop body
    { pc: 10, opcode: "JUMP" }, // step 4: back-edge (reuse at step 5)
    { pc: 4, opcode: "JUMPDEST" }, // step 5: loop body
  ];

  it("keeps the stack at constant depth across the back-edge", () => {
    // Reused in place: one frame in, one frame out — depth 1.
    expect(buildCallStack(trace, pcToInstruction, 3)).toHaveLength(1);
    expect(buildCallStack(trace, pcToInstruction, 5)).toHaveLength(1);
  });

  it("reuses the top frame with the next iteration's identity", () => {
    const stack = buildCallStack(trace, pcToInstruction, 3);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].callType).toBe("internal");
    // Rooted at the back-edge's postcondition step, not the
    // original entry's.
    expect(stack[0].stepIndex).toBe(3);
  });

  it("still pushes and pops ordinary (non-flat) calls", () => {
    // A normal invoke on one instruction, a normal return on
    // another — depth rises then falls, in contrast to the flat
    // back-edge which reuses the frame in place. The pop uses
    // close-after semantics: the frame stays visible on the step
    // that observes the return's postcondition and is popped only
    // once execution advances past it.
    const normalProgram = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "helper" } }),
        instr(8, { return: { identifier: "helper" } }),
      ],
    } as unknown as Program;
    const map = buildPcToInstructionMap(normalProgram);
    const normalTrace: TraceStep[] = [
      { pc: 0, opcode: "JUMPDEST" }, // invoke helper
      { pc: 8, opcode: "JUMP" }, // return helper
      { pc: 12, opcode: "JUMPDEST" }, // back in the caller
      { pc: 13, opcode: "STOP" },
    ];
    // Not yet pushed: the invoke has not executed.
    expect(buildCallStack(normalTrace, map, 0)).toHaveLength(0);
    // Pushed once the invoke has executed.
    expect(buildCallStack(normalTrace, map, 1)).toHaveLength(1);
    // Still visible on the return's postcondition step (close-after).
    expect(buildCallStack(normalTrace, map, 2)).toHaveLength(1);
    // Popped once execution advances past the return.
    expect(buildCallStack(normalTrace, map, 3)).toHaveLength(0);
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
      { pc: 4, opcode: "JUMPDEST" },
    ];
    const program = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "sum" } }),
        instr(10, flatBackEdge),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    const stack = buildCallStack(trace, pcToInstruction, 2);
    expect(stack).toHaveLength(1);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].isTailCall).toBe(true);
    expect(stack[0].callType).toBe("internal");
  });

  it("does not label a tail call when the marker is stripped", () => {
    // With the transform marker gone, the flat {return, invoke}
    // back-edge is still reused in place structurally (the call
    // stack stays correct for consumers that ignore transforms),
    // but no frame is *labeled* isTailCall — the chip/banner
    // rendering follows the `tailcall` transform marker, which
    // is absent here.
    const stripped = {
      return: { identifier: "sum" },
      invoke: { jump: true, identifier: "sum" },
    };
    const trace: TraceStep[] = [
      { pc: 0, opcode: "JUMPDEST" },
      { pc: 10, opcode: "JUMP" },
      { pc: 4, opcode: "JUMPDEST" },
    ];
    const program = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "sum" } }),
        instr(10, stripped),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    const stack = buildCallStack(trace, pcToInstruction, 2);
    expect(stack.some((f) => f.isTailCall)).toBe(false);
  });
});

// Inlined internal calls (level-2 `inline` transform) produce
// VIRTUAL activations, not real ones. The compiler brackets an
// inlined body with a virtual invoke on the entry-first
// instruction and a virtual return on the exit-last instruction;
// every inlined instruction carries transform:["inline"]. The
// call stack reconstructs the virtual frame via close-after
// push/pop (a frame is visible on the step that observes its
// return's postcondition and popped on advance), tags it, and —
// belt-and-suspenders — tears down any trailing virtual frame the
// moment execution has passed an instruction whose inline-marker
// count is below the open virtual depth. So it reads distinctly
// from a real call and never leaks a phantom frame into caller
// code.
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
  // A body that emits to a single EVM op: invoke and return
  // co-locate on one instruction (the degenerate bracketed case).
  const singleOpBody = {
    code: { source: { id: "0" }, range: { offset: 0, length: 1 } },
    transform: ["inline"],
    invoke: { jump: true, identifier: "dbl" },
    return: { identifier: "dbl" },
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

  describe("extractCallEvents exposes both discriminators", () => {
    it("returns invoke then return, in order, for a co-located context", () => {
      const events = extractCallEvents(instr(0, singleOpBody));
      expect(events.map((e) => e.kind)).toEqual(["invoke", "return"]);
      expect(events.every((e) => e.isInline)).toBe(true);
    });

    it("returns a single invoke event for a pure invoke", () => {
      const events = extractCallEvents(instr(0, entryInvoke));
      expect(events.map((e) => e.kind)).toEqual(["invoke"]);
    });

    it("returns a single return event for a pure return", () => {
      const events = extractCallEvents(instr(0, exitReturn));
      expect(events.map((e) => e.kind)).toEqual(["return"]);
    });
  });

  describe("buildCallStack virtual frame lifetime (close-after)", () => {
    // A single inlined body: entry / body / exit / caller.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // entry invoke (push at step 1)
      { pc: 1, opcode: "ADD" }, // inlined body instruction
      { pc: 2, opcode: "MSTORE" }, // exit return (pop at step 4)
      { pc: 3, opcode: "JUMPDEST" }, // caller code
      { pc: 4, opcode: "STOP" },
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

    it("pushes a virtual frame tagged isInline after the entry", () => {
      expect(buildCallStack(trace, pcToInstruction, 0)).toHaveLength(0);
      const stack = buildCallStack(trace, pcToInstruction, 1);
      expect(stack).toHaveLength(1);
      expect(stack[0].identifier).toBe("dbl");
      expect(stack[0].isInline).toBe(true);
    });

    it("keeps the virtual frame open across the inlined body", () => {
      const stack = buildCallStack(trace, pcToInstruction, 2);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
    });

    it("still shows the frame after the exit return (close-after)", () => {
      const stack = buildCallStack(trace, pcToInstruction, 3);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
    });

    it("pops the frame once execution advances past the return", () => {
      const stack = buildCallStack(trace, pcToInstruction, 4);
      expect(stack).toHaveLength(0);
    });
  });

  describe("single-op inlined body (co-located invoke+return)", () => {
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // the whole body: invoke+return
      { pc: 1, opcode: "JUMPDEST" }, // caller code
      { pc: 2, opcode: "STOP" },
    ];
    const program = {
      instructions: [instr(0, singleOpBody), instr(1, callerMark)],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("shows the virtual frame after the single body op", () => {
      const stack = buildCallStack(trace, pcToInstruction, 1);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
    });

    it("pops after advancing further", () => {
      expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(0);
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
      { pc: 14, opcode: "STOP" },
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
      const stack = buildCallStack(trace, pcToInstruction, 4);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBe(true);
      expect(stack[0].stepIndex).toBe(4);
    });

    it("is empty after both sites — no accumulation", () => {
      const stack = buildCallStack(trace, pcToInstruction, 6);
      expect(stack).toHaveLength(0);
    });
  });

  describe("two ADJACENT inline sites split by the return", () => {
    // No caller gap between sites: the return marker (not the
    // membership guard, which can't see a boundary between two
    // inline-marked instructions) is what closes site 1 before
    // site 2 opens.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // site 1 entry
      { pc: 1, opcode: "MSTORE" }, // site 1 exit
      { pc: 2, opcode: "PUSH1" }, // site 2 entry (immediately)
      { pc: 3, opcode: "MSTORE" }, // site 2 exit
      { pc: 5, opcode: "JUMPDEST" }, // caller
      { pc: 6, opcode: "STOP" },
    ];
    const program = {
      instructions: [
        instr(0, entryInvoke),
        instr(1, exitReturn),
        instr(2, entryInvoke),
        instr(3, exitReturn),
        instr(5, callerMark),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("does not merge or accumulate — one frame, rooted at site 2", () => {
      const stack = buildCallStack(trace, pcToInstruction, 3);
      expect(stack).toHaveLength(1);
      expect(stack[0].stepIndex).toBe(3);
    });

    it("is empty after both sites", () => {
      expect(buildCallStack(trace, pcToInstruction, 5)).toHaveLength(0);
    });
  });

  describe("marker-keyed dedup", () => {
    // A real call and an inlined body of the SAME name on
    // consecutive steps must NOT be merged by the caller-JUMP /
    // callee-JUMPDEST dedup — they are distinct activations.
    const realInvoke = { invoke: { jump: true, identifier: "dbl" } };
    const trace: TraceStep[] = [
      { pc: 0, opcode: "JUMP" }, // real invoke of dbl
      { pc: 1, opcode: "PUSH1" }, // virtual (inline) invoke of dbl
      { pc: 2, opcode: "ADD" },
    ];
    const program = {
      instructions: [instr(0, realInvoke), instr(1, entryInvoke)],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("keeps a real and a virtual dbl as two separate frames", () => {
      const stack = buildCallStack(trace, pcToInstruction, 2);
      expect(stack).toHaveLength(2);
      expect(stack[0].isInline).toBeFalsy();
      expect(stack[1].isInline).toBe(true);
    });
  });

  describe("nested inlining (double inline marker)", () => {
    // Helper A inlined into helper B which is itself inlined:
    // A's body instructions are members of both bodies and carry
    // transform:["inline","inline"]. Two virtual frames stack; the
    // inner returns first, leaving the outer.
    const entryB = {
      transform: ["inline"],
      invoke: { jump: true, identifier: "B" },
    };
    const entryA = {
      transform: ["inline", "inline"],
      invoke: { jump: true, identifier: "A" },
    };
    const exitA = {
      transform: ["inline", "inline"],
      return: { identifier: "A" },
    };
    const bodyB = { transform: ["inline"] }; // back to just B's body
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // enter B
      { pc: 1, opcode: "PUSH1" }, // enter A (inside B)
      { pc: 2, opcode: "MSTORE" }, // exit A
      { pc: 3, opcode: "ADD" }, // back in B only
      { pc: 4, opcode: "STOP" },
    ];
    const program = {
      instructions: [
        instr(0, entryB),
        instr(1, entryA),
        instr(2, exitA),
        instr(3, bodyB),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("stacks two virtual frames inside the inner body", () => {
      const stack = buildCallStack(trace, pcToInstruction, 2);
      expect(stack).toHaveLength(2);
      expect(stack[0].identifier).toBe("B");
      expect(stack[1].identifier).toBe("A");
    });

    it("drops to the outer frame after the inner returns", () => {
      const stack = buildCallStack(trace, pcToInstruction, 4);
      expect(stack).toHaveLength(1);
      expect(stack[0].identifier).toBe("B");
    });
  });

  describe("defensive membership guard", () => {
    // A virtual invoke whose exit return never arrives (residual
    // smear / dropped marker): the frame must still be torn down
    // once execution has passed a non-inline caller instruction,
    // rather than leaking to the end of the trace.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // virtual invoke (push at step 1)
      { pc: 1, opcode: "ADD" }, // still inside the body
      { pc: 3, opcode: "JUMPDEST" }, // caller code, no inline marker
      { pc: 4, opcode: "STOP" },
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
      expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(1);
    });

    it("force-pops a stale virtual frame past a non-inline instr", () => {
      expect(buildCallStack(trace, pcToInstruction, 3)).toHaveLength(0);
    });
  });

  describe("real calls (regression: close-after applies uniformly)", () => {
    // A real call: caller JUMP + callee JUMPDEST (deduped), then a
    // return. The frame is visible on the return's postcondition
    // step and popped on advance — same close-after rule as virtual
    // frames.
    const trace: TraceStep[] = [
      { pc: 0, opcode: "JUMP" }, // caller invoke
      { pc: 1, opcode: "JUMPDEST" }, // callee entry invoke (dedup)
      { pc: 2, opcode: "JUMP" }, // callee return
      { pc: 3, opcode: "JUMPDEST" }, // back in caller
      { pc: 4, opcode: "STOP" },
    ];
    const program = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "f" } }),
        instr(1, { invoke: { jump: true, identifier: "f" } }),
        instr(2, { return: { identifier: "f" } }),
        instr(3, { code: { source: { id: "0" }, range: {} } }),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("collapses the caller/callee invoke double into one frame", () => {
      expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(1);
    });

    it("still shows the frame after its return instruction", () => {
      const stack = buildCallStack(trace, pcToInstruction, 3);
      expect(stack).toHaveLength(1);
      expect(stack[0].isInline).toBeFalsy();
    });

    it("pops the real frame on advancing past the return", () => {
      expect(buildCallStack(trace, pcToInstruction, 4)).toHaveLength(0);
    });
  });

  describe("bracketed emission (post de-smear, #235 shape)", () => {
    // The real bracketed shape: invoke on the body's FIRST op,
    // return on its LAST op, transform:["inline"] on every op. The
    // frame must be visible across the whole body — including the
    // return-bearing exit op (close-after) — and gone at the gap.
    const entryOp = {
      transform: ["inline"],
      invoke: { jump: true, identifier: "dbl" },
    };
    const interiorOp = { transform: ["inline"] };
    const exitOp = { transform: ["inline"], return: { identifier: "dbl" } };
    const gapOp = { code: { source: { id: "0" }, range: {} } };
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // entry op (invoke)
      { pc: 1, opcode: "DUP2" }, // interior op
      { pc: 2, opcode: "ADD" }, // interior op
      { pc: 3, opcode: "MSTORE" }, // exit op (return)
      { pc: 4, opcode: "JUMPDEST" }, // gap / caller
      { pc: 5, opcode: "STOP" },
    ];
    const program = {
      instructions: [
        instr(0, entryOp),
        instr(1, interiorOp),
        instr(2, interiorOp),
        instr(3, exitOp),
        instr(4, gapOp),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("shows the virtual frame across every body op incl. the exit", () => {
      expect(buildCallStack(trace, pcToInstruction, 0)).toHaveLength(0);
      for (const s of [1, 2, 3, 4]) {
        const stack = buildCallStack(trace, pcToInstruction, s);
        expect(stack).toHaveLength(1);
        expect(stack[0].isInline).toBe(true);
      }
    });

    it("is gone at the gap after the return op", () => {
      expect(buildCallStack(trace, pcToInstruction, 5)).toHaveLength(0);
    });
  });

  describe("robustness: legacy SMEARED emission (pre de-smear)", () => {
    // Belt-and-suspenders: an older/residual emission where EVERY
    // body op carries invoke+return+inline. Close-after must still
    // yield exactly one frame per body across all ops (the viewed
    // op's co-located return is deferred; prior ops net empty) and
    // no accumulation across two gap-separated bodies.
    const smearedOp = {
      transform: ["inline"],
      invoke: { jump: true, identifier: "dbl" },
      return: { identifier: "dbl" },
    };
    const gapOp = { code: { source: { id: "0" }, range: {} } };
    const trace: TraceStep[] = [
      { pc: 0, opcode: "PUSH1" }, // body 1: 3 smeared ops
      { pc: 1, opcode: "DUP2" },
      { pc: 2, opcode: "MSTORE" },
      { pc: 3, opcode: "JUMPDEST" }, // gap
      { pc: 4, opcode: "PUSH1" }, // body 2: 3 smeared ops
      { pc: 5, opcode: "DUP2" },
      { pc: 6, opcode: "MSTORE" },
      { pc: 7, opcode: "JUMPDEST" }, // gap
      { pc: 8, opcode: "STOP" },
    ];
    const program = {
      instructions: [
        instr(0, smearedOp),
        instr(1, smearedOp),
        instr(2, smearedOp),
        instr(3, gapOp),
        instr(4, smearedOp),
        instr(5, smearedOp),
        instr(6, smearedOp),
        instr(7, gapOp),
      ],
    } as unknown as Program;
    const pcToInstruction = buildPcToInstructionMap(program);

    it("shows exactly one frame across each smeared body", () => {
      for (const s of [1, 2, 3, 5, 6, 7]) {
        const stack = buildCallStack(trace, pcToInstruction, s);
        expect(stack).toHaveLength(1);
        expect(stack[0].isInline).toBe(true);
      }
    });

    it("returns to top level at each gap — no accumulation", () => {
      expect(buildCallStack(trace, pcToInstruction, 4)).toHaveLength(0);
      expect(buildCallStack(trace, pcToInstruction, 8)).toHaveLength(0);
    });
  });
});

// Instruction contexts are POSTCONDITIONS: at trace step i the
// frame list must reflect instructions 0..i-1 (program-level
// context as the base case), so that it agrees at every step with
// the call-info banner, which is selected by effectiveContextForStep
// under the same rule.
describe("buildCallStack postcondition timing", () => {
  // A real call as the compiler emits it: invoke on the caller JUMP
  // AND the callee entry JUMPDEST (which also carries the argument
  // pointers), then a return on the callee's exit JUMP.
  const argPointer = { name: "x", location: "stack", slot: 0 };
  const program = {
    instructions: [
      instr(0, { code: {} }), // caller prologue
      instr(1, { invoke: { jump: true, identifier: "f" } }), // caller JUMP
      instr(2, {
        invoke: {
          jump: true,
          identifier: "f",
          arguments: { pointer: { group: [argPointer] } },
        },
      }), // callee entry JUMPDEST
      instr(3, { code: {} }), // callee body
      instr(4, { return: { identifier: "f" } }), // callee exit JUMP
      instr(5, { code: {} }), // back in the caller
      instr(6, { code: {} }),
    ],
  } as unknown as Program;
  const pcToInstruction = buildPcToInstructionMap(program);
  const trace: TraceStep[] = [0, 1, 2, 3, 4, 5, 6].map((pc) => ({
    pc,
    opcode: "JUMPDEST",
  }));

  /** The call-info banner's selection for a step. */
  const banner = (stepIndex: number) => {
    const context = effectiveContextForStep({
      programContext: program.context,
      contextAtPc: (pc) => pcToInstruction.get(pc)?.context,
      trace,
      stepIndex,
    });
    return context
      ? extractCallInfoFromInstruction(instr(0, context))
      : undefined;
  };

  it("shows no frame while parked on the caller JUMP", () => {
    // Step 1 is ABOUT to execute the invoke; it has not run yet, so
    // neither the banner nor the frame list may show it.
    expect(banner(1)).toBeUndefined();
    expect(buildCallStack(trace, pcToInstruction, 1)).toHaveLength(0);
  });

  it("pushes the frame on the step the banner first names the invoke", () => {
    expect(banner(2)?.kind).toBe("invoke");
    const stack = buildCallStack(trace, pcToInstruction, 2);
    expect(stack).toHaveLength(1);
    expect(stack[0].identifier).toBe("f");
    expect(stack[0].stepIndex).toBe(2);
  });

  it("agrees with the banner at every step", () => {
    const depths = trace.map(
      (_, i) => buildCallStack(trace, pcToInstruction, i).length,
    );
    const kinds = trace.map((_, i) => banner(i)?.kind);
    // The frame opens with the invoke's postcondition and — under
    // close-after — is still shown alongside the return banner,
    // vanishing on the step after.
    expect(kinds).toEqual([
      undefined,
      undefined,
      "invoke",
      "invoke",
      undefined,
      "return",
      undefined,
    ]);
    expect(depths).toEqual([0, 0, 1, 1, 1, 1, 0]);
  });

  it("roots the frame at the step after the callee entry", () => {
    // The dedup keeps the callee JUMPDEST's argument pointers, and
    // those are its postcondition — they describe the state observed
    // at the step AFTER it, which is where the frame is rooted.
    const stack = buildCallStack(trace, pcToInstruction, 4);
    expect(stack[0].stepIndex).toBe(3);
    expect(stack[0].argumentNames).toEqual(["x"]);
    expect(stack[0].argumentPointers).toEqual([argPointer]);
  });

  it("opens a frame from the program-level context at the first step", () => {
    const entryProgram = {
      context: { invoke: { jump: true, identifier: "main" } },
      instructions: [instr(0, { code: {} })],
    } as unknown as Program;
    const stack = buildCallStack(
      [{ pc: 0, opcode: "JUMPDEST" }],
      buildPcToInstructionMap(entryProgram),
      0,
      entryProgram.context,
    );
    expect(stack).toHaveLength(1);
    expect(stack[0].identifier).toBe("main");
    expect(stack[0].stepIndex).toBe(0);
  });
});

describe("buildCallStack membership guard on context-less steps", () => {
  // A virtual invoke whose exit return never arrives, followed by
  // an instruction carrying no context at all: no context means no
  // inline membership, so the stale virtual frame is torn down just
  // as it would be at a context-bearing caller instruction.
  const trace: TraceStep[] = [
    { pc: 0, opcode: "PUSH1" }, // virtual invoke (push at step 1)
    { pc: 1, opcode: "JUMPDEST" }, // no context
    { pc: 2, opcode: "STOP" },
  ];
  const program = {
    instructions: [
      instr(0, {
        transform: ["inline"],
        invoke: { jump: true, identifier: "dbl" },
      }),
      instr(1, undefined),
    ],
  } as unknown as Program;
  const pcToInstruction = buildPcToInstructionMap(program);

  it("force-pops the stale virtual frame", () => {
    expect(buildCallStack(trace, pcToInstruction, 1)).toHaveLength(1);
    expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(0);
  });
});
