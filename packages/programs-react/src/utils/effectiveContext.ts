/**
 * Postcondition-aware selection of the instruction context that
 * describes the machine state observed at a given trace step.
 *
 * Instruction contexts are POSTCONDITIONS: instruction i's
 * context — its semantic facts AND its pointers — describes the
 * machine state AFTER i executes. A trace step observes the state
 * BEFORE its instruction executes, so the step about to execute
 * instruction i is observing the postcondition of instruction
 * i-1. The consumer rule is therefore: prepend the program-level
 * context and index the resulting sequence by trace position —
 * i.e. apply instruction (i-1)'s context at step i, with the
 * program-level context as the base case for the first step.
 *
 * Pointer resolution still runs against the state observed at
 * step i; only the CONTEXT selection shifts.
 */

import type { Program } from "@ethdebug/format";

/**
 * Inputs for {@link effectiveContextForStep}. The context source
 * is supplied as an accessor so callers with different
 * instruction shapes (e.g. `instruction.context` vs
 * `instruction.debug.context`) can share this logic.
 */
export interface EffectiveContextInput {
  /** Program-level context (base case for the first step). */
  programContext?: Program.Context;
  /** Resolve the context carried by the instruction at a pc. */
  contextAtPc(pc: number): Program.Context | undefined;
  /** The trace, indexed by step position. */
  trace: ReadonlyArray<{ pc: number }>;
  /** The current step position. */
  stepIndex: number;
}

/**
 * Return the context describing the state observed at
 * `stepIndex`: the program-level context at the first step,
 * otherwise the context of the instruction executed at the
 * previous step.
 */
export function effectiveContextForStep({
  programContext,
  contextAtPc,
  trace,
  stepIndex,
}: EffectiveContextInput): Program.Context | undefined {
  if (stepIndex <= 0) {
    return programContext;
  }

  const previous = trace[stepIndex - 1];
  if (!previous) {
    return programContext;
  }

  return contextAtPc(previous.pc);
}
