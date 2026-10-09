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
 * A single step in an execution trace: the state before the step's
 * instruction runs.
 */
export interface TraceStep {
  /** Program counter */
  pc: number;
  /** Opcode name (e.g., "PUSH1", "SLOAD") */
  opcode: string;
  /** Stack state at this step */
  stack: bigint[];
  /**
   * Memory state at this step. Absent with the "none" memory policy.
   * With the "changed" policy, steps whose memory did not change share
   * one array: do not mutate it.
   */
  memory?: Uint8Array;
  /** Gas remaining (optional) */
  gasRemaining?: bigint;
  /** Gas cost of the step's instruction (static + dynamic fee) */
  gasCost?: bigint;
  /** Message depth: 0 for the transaction's own message */
  depth?: number;
  /** Address whose storage the step's frame uses */
  address?: string;
  /** Address whose code the step's frame runs */
  codeAddress?: string;
}

/**
 * Handler function for trace steps during execution.
 */
export type TraceHandler = (step: TraceStep) => void;

/**
 * How a trace records memory at each step:
 * - "none": no memory;
 * - "full": a new copy at every step;
 * - "changed": a new copy only when memory changed since the frame's
 *   previous step; otherwise the step shares that step's array.
 */
export type MemoryPolicy = "none" | "full" | "changed";

/**
 * One message (a call or a create) of a transaction.
 */
export interface MessageFrame {
  /** Message depth: 0 for the transaction's own message */
  depth: number;
  /** Address whose storage the frame uses (the new contract's address
   * for a create) */
  address: string;
  /** Address whose code the frame runs */
  codeAddress: string;
  /** The message's sender */
  caller: string;
  /** Input data (empty for a create) */
  calldata: Uint8Array;
  /** Init code, for a create */
  initcode?: Uint8Array;
  /** Value sent with the message */
  value: bigint;
  /** Whether the message is a create */
  create: boolean;
  /** Whether the message is a DELEGATECALL */
  delegatecall: boolean;
  /** Whether the message is static (STATICCALL) */
  static: boolean;
}

/**
 * A message frame starts ("enter") or ends ("exit"). An exit carries
 * the message's return data (for a create: the deployed code) and
 * whether the message reverted, so its state changes were undone.
 */
export type FrameEvent =
  | { kind: "enter"; frame: MessageFrame }
  | {
      kind: "exit";
      frame: MessageFrame;
      returnData: Uint8Array;
      reverted: boolean;
      error?: string;
    };

/**
 * Handler function for message frame events during execution.
 */
export type FrameHandler = (event: FrameEvent) => void;

/**
 * What to record while executing.
 */
export interface TraceOptions {
  /** Called before each instruction */
  step?: TraceHandler;
  /** Called when a message frame starts or ends */
  frame?: FrameHandler;
  /** How steps record memory (default "full") */
  memory?: MemoryPolicy;
}

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
