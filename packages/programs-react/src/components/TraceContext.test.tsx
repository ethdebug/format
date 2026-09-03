/**
 * Integration tests for TraceProvider's postcondition-aware
 * context selection. Instruction contexts are postconditions, so
 * the variables/call-info shown at the step about to execute
 * instruction i come from instruction i-1 (program-level context
 * at the first step). See effectiveContextForStep.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import type { Program } from "@ethdebug/format";
import { TraceProvider, useTraceContext } from "./TraceContext.js";
import type { TraceStep } from "#utils/mockTrace";

function instr(offset: number, context: unknown): Program.Instruction {
  return {
    offset,
    operation: { mnemonic: "JUMPDEST", arguments: [] },
    context,
  } as unknown as Program.Instruction;
}

const program = {
  context: { variables: [{ identifier: "prog" }] },
  instructions: [
    instr(0, { variables: [{ identifier: "v0" }] }),
    instr(3, { variables: [{ identifier: "v1" }] }),
    instr(6, { variables: [{ identifier: "v2" }] }),
  ],
} as unknown as Program;

const trace: TraceStep[] = [
  { pc: 0, opcode: "JUMPDEST" },
  { pc: 3, opcode: "JUMPDEST" },
  { pc: 6, opcode: "JUMPDEST" },
];

// Stable identity so the provider's resolution effects don't
// re-run every render (the default `templates={}` would mint a new
// object each render).
const templates = {};

function renderTrace() {
  return renderHook(() => useTraceContext(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <TraceProvider
        trace={trace}
        program={program}
        templates={templates}
        resolveVariables={false}
      >
        {children}
      </TraceProvider>
    ),
  });
}

const ids = (vars: { identifier?: string }[]) => vars.map((v) => v.identifier);

describe("TraceProvider postcondition context selection", () => {
  it("shows the program-level context at the first step", () => {
    const { result } = renderTrace();
    expect(ids(result.current.currentVariables)).toEqual(["prog"]);
  });

  it("shows the previous instruction's variables after stepping", () => {
    const { result } = renderTrace();

    act(() => result.current.jumpToStep(1));
    // step 1 executes pc=3; observed state is the postcondition of
    // pc=0, so the panel shows v0 (NOT v1).
    expect(ids(result.current.currentVariables)).toEqual(["v0"]);

    act(() => result.current.jumpToStep(2));
    expect(ids(result.current.currentVariables)).toEqual(["v1"]);
  });
});

describe("TraceProvider postcondition call-info selection", () => {
  const callProgram = {
    instructions: [
      instr(0, { invoke: { jump: true, identifier: "sum" } }),
      instr(3, { variables: [] }),
    ],
  } as unknown as Program;

  const callTrace: TraceStep[] = [
    { pc: 0, opcode: "JUMPDEST" },
    { pc: 3, opcode: "JUMPDEST" },
  ];

  function render() {
    return renderHook(() => useTraceContext(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <TraceProvider
          trace={callTrace}
          program={callProgram}
          templates={templates}
          resolveVariables={false}
        >
          {children}
        </TraceProvider>
      ),
    });
  }

  it("does not show the invoke while parked on the invoke instruction", () => {
    const { result } = render();
    // step 0 is about to execute pc=0 (the invoke); it has not run
    // yet, so no call info is shown.
    expect(result.current.currentCallInfo).toBeUndefined();
  });

  it("shows the invoke once its instruction has executed", () => {
    const { result } = render();
    act(() => result.current.jumpToStep(1));
    // step 1 observes the postcondition of pc=0, so the invoke of
    // "sum" surfaces here.
    expect(result.current.currentCallInfo?.kind).toBe("invoke");
    expect(result.current.currentCallInfo?.identifier).toBe("sum");
  });
});

describe("TraceProvider call-stack timing", () => {
  // A real call as the compiler emits it: invoke on the caller
  // JUMP and on the callee entry JUMPDEST (with the argument
  // pointers), then the callee body. The JUMP pops its target, so
  // the argument's stack slot only holds the argument once the
  // JUMPDEST is reached; JUMPDEST itself is a no-op, so the state
  // observed at the JUMPDEST and at the step after it coincide.
  const callProgram = {
    instructions: [
      instr(0, { invoke: { jump: true, identifier: "f" } }),
      instr(1, {
        invoke: {
          jump: true,
          identifier: "f",
          arguments: {
            pointer: { group: [{ name: "x", location: "stack", slot: 0 }] },
          },
        },
      }),
      instr(2, { code: {} }),
    ],
  } as unknown as Program;

  // Stack entries are listed bottom-to-top.
  const callTrace: TraceStep[] = [
    { pc: 0, opcode: "JUMP", stack: ["0x2a", "0x01"] },
    { pc: 1, opcode: "JUMPDEST", stack: ["0x2a"] },
    { pc: 2, opcode: "PUSH1", stack: ["0x2a"] },
  ];

  function render() {
    return renderHook(() => useTraceContext(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <TraceProvider
          trace={callTrace}
          program={callProgram}
          templates={templates}
          resolveVariables={true}
        >
          {children}
        </TraceProvider>
      ),
    });
  }

  it("shows the frame and the invoke banner on the same step", () => {
    const { result } = render();
    // Parked on the caller JUMP: neither the banner nor the frame
    // list shows the call yet.
    expect(result.current.currentCallInfo).toBeUndefined();
    expect(result.current.callStack).toHaveLength(0);

    act(() => result.current.jumpToStep(1));
    expect(result.current.currentCallInfo?.kind).toBe("invoke");
    expect(result.current.callStack).toHaveLength(1);
    expect(result.current.callStack[0].identifier).toBe("f");
  });

  it("resolves arguments against the entry's postcondition", async () => {
    const { result } = render();
    act(() => result.current.jumpToStep(2));

    // The frame is rooted at the step after the JUMPDEST, which is
    // where its argument pointers describe the observed state.
    expect(result.current.callStack[0].stepIndex).toBe(2);
    expect(result.current.callStack[0].argumentNames).toEqual(["x"]);

    await waitFor(() => {
      const args = result.current.resolvedCallStack[0]?.resolvedArgs;
      expect(args?.[0]?.value).toBeDefined();
    });
    const [x] = result.current.resolvedCallStack[0].resolvedArgs!;
    expect(x.name).toBe("x");
    expect(x.error).toBeUndefined();
    expect(BigInt(x.value!)).toBe(42n);
  });
});
