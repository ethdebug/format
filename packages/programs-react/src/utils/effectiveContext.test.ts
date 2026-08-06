/**
 * Tests for effectiveContextForStep — the postcondition-aware
 * selection of which instruction context describes the machine
 * state observed at a given trace step.
 *
 * Instruction contexts are POSTCONDITIONS: instruction i's
 * context describes the state AFTER i executes. A debugger
 * paused at the trace step about to execute instruction i is
 * observing the state produced by instruction i-1, so it must
 * apply instruction i-1's context. Program-level context is the
 * base case for the first step.
 */

import { describe, it, expect } from "vitest";
import type { Program } from "@ethdebug/format";
import { effectiveContextForStep } from "./effectiveContext.js";

const programContext = {
  code: { range: { offset: 0, length: 1 } },
} as Program.Context;
const ctxAt10 = {
  variables: [{ identifier: "a" }],
} as unknown as Program.Context;
const ctxAt20 = {
  variables: [{ identifier: "b" }],
} as unknown as Program.Context;

const contextByPc = new Map<number, Program.Context>([
  [10, ctxAt10],
  [20, ctxAt20],
]);
const contextAtPc = (pc: number) => contextByPc.get(pc);

const trace = [{ pc: 10 }, { pc: 20 }];

describe("effectiveContextForStep", () => {
  it("returns the program-level context at the first step", () => {
    const result = effectiveContextForStep({
      programContext,
      contextAtPc,
      trace,
      stepIndex: 0,
    });
    expect(result).toBe(programContext);
  });

  it("returns undefined at the first step when there is no program context", () => {
    const result = effectiveContextForStep({
      programContext: undefined,
      contextAtPc,
      trace,
      stepIndex: 0,
    });
    expect(result).toBeUndefined();
  });

  it("returns the PREVIOUS step's instruction context, not the current step's", () => {
    const result = effectiveContextForStep({
      programContext,
      contextAtPc,
      trace,
      stepIndex: 1,
    });
    // step 1 executes pc=20; the observed state is the postcondition
    // of pc=10, so context(pc=10) must be returned.
    expect(result).toBe(ctxAt10);
    expect(result).not.toBe(ctxAt20);
  });

  it("returns undefined when the previous step's instruction has no context", () => {
    const result = effectiveContextForStep({
      programContext,
      contextAtPc: () => undefined,
      trace,
      stepIndex: 1,
    });
    expect(result).toBeUndefined();
  });
});
