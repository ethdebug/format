/**
 * Tests for call-stack construction, with focus on the flat
 * tail-call back-edge shape: a single instruction that carries
 * both a `return` and an `invoke` context.
 */

import { describe, it, expect } from "vitest";
import type { Program } from "@ethdebug/format";
import {
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
