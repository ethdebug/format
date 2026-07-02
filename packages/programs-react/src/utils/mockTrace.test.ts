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
