/**
 * EVM Execution Trace Types
 *
 * Types for capturing and representing EVM execution traces.
 */

import type { Machine } from "@ethdebug/pointers";
import type { Executor } from "#executor";
import type { ExecutionOptions } from "#executor";
import { createMachineState } from "#machine";

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
 * Create a trace handler that collects steps into a
 * Trace object.
 *
 * @returns [handler, getTrace] tuple
 */
export function createTraceCollector(): [TraceHandler, () => Trace] {
  const steps: TraceStep[] = [];

  const handler: TraceHandler = (step) => {
    steps.push(step);
  };

  const getTrace = (): Trace => ({ steps: [...steps] });

  return [handler, getTrace];
}

/**
 * Create a Machine that traces execution and yields
 * Machine.State for each step.
 *
 * @param executor - EVM executor to trace
 * @param options - Execution options for the call
 */
export function createMachine(
  executor: Executor,
  options: ExecutionOptions = {},
): Machine {
  return {
    trace(): AsyncIterable<Machine.State> {
      return traceExecution(executor, options);
    },
  };
}

async function* traceExecution(
  executor: Executor,
  options: ExecutionOptions,
): AsyncGenerator<Machine.State> {
  const steps: TraceStep[] = [];
  const handler: TraceHandler = (step) => {
    steps.push(step);
  };

  await executor.execute(options, handler);

  for (let i = 0; i < steps.length; i++) {
    yield createMachineState(executor, {
      traceStep: steps[i],
      traceIndex: BigInt(i),
    });
  }
}
