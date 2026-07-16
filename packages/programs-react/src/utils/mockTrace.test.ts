/**
 * Tests for trace context extraction, transform (tailcall)
 * detection, and call-stack construction — including the flat
 * tail-call back-edge shape: a single instruction that carries
 * both a `return` and an `invoke` context.
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
    { pc: 0, opcode: "JUMPDEST" }, // step 0: push sum
    { pc: 4, opcode: "JUMPDEST" }, // step 1: loop body
    { pc: 10, opcode: "JUMP" }, // step 2: back-edge → reuse
    { pc: 4, opcode: "JUMPDEST" }, // step 3: loop body
    { pc: 10, opcode: "JUMP" }, // step 4: back-edge → reuse
  ];

  it("keeps the stack at constant depth across the back-edge", () => {
    // Reused in place: one frame in, one frame out — depth 1.
    expect(buildCallStack(trace, pcToInstruction, 2)).toHaveLength(1);
    expect(buildCallStack(trace, pcToInstruction, 4)).toHaveLength(1);
  });

  it("reuses the top frame with the next iteration's identity", () => {
    const stack = buildCallStack(trace, pcToInstruction, 2);
    expect(stack[0].identifier).toBe("sum");
    expect(stack[0].callType).toBe("internal");
    // Points at the back-edge step, not the original entry.
    expect(stack[0].stepIndex).toBe(2);
  });

  it("still pushes and pops ordinary (non-flat) calls", () => {
    // A normal invoke on one instruction, a normal return on
    // another — depth should rise then fall.
    const normalProgram = {
      instructions: [
        instr(0, { invoke: { jump: true, identifier: "helper" } }),
        instr(8, { return: { identifier: "helper" } }),
      ],
    } as unknown as Program;
    const map = buildPcToInstructionMap(normalProgram);
    const normalTrace: TraceStep[] = [
      { pc: 0, opcode: "JUMPDEST" },
      { pc: 8, opcode: "JUMP" },
    ];
    expect(buildCallStack(normalTrace, map, 0)).toHaveLength(1);
    expect(buildCallStack(normalTrace, map, 1)).toHaveLength(0);
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
