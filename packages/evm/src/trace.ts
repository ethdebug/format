/**
 * EVM Execution Trace Types
 *
 * Types for capturing and representing EVM execution traces.
 */

/**
 * A single step in an execution trace.
 */
export interface TraceStep {
  /** Program counter */
  pc: number;
  /** Opcode name (e.g., "PUSH1", "SLOAD") */
  opcode: string;
  /** Stack state at this step */
  stack: bigint[];
  /** Memory state at this step (optional) */
  memory?: Uint8Array;
  /** Gas remaining (optional) */
  gasRemaining?: bigint;
}

/**
 * Handler function for trace steps during execution.
 */
export type TraceHandler = (step: TraceStep) => void;

/**
 * A complete execution trace.
 */
export interface Trace {
  /** All steps in the trace */
  steps: TraceStep[];
}

/**
 * Create a trace handler that collects steps into a Trace object.
 *
 * @returns A tuple of [handler, getTrace] where handler collects steps
 *          and getTrace returns the collected trace.
 */
export function createTraceCollector(): [TraceHandler, () => Trace] {
  const steps: TraceStep[] = [];

  const handler: TraceHandler = (step) => {
    steps.push(step);
  };

  const getTrace = (): Trace => ({ steps: [...steps] });

  return [handler, getTrace];
}
