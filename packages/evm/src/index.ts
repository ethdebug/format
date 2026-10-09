/**
 * @ethdebug/evm
 *
 * EVM execution and state access for ethdebug/format.
 *
 * This package provides:
 * - An EVM executor for running bytecode in isolation
 * - A Machine.State adapter for pointer evaluation
 * - Execution trace capture utilities
 *
 * @example
 * ```typescript
 * import { Executor, createTrace, createMachineState } from "@ethdebug/evm";
 * import { dereference } from "@ethdebug/pointers";
 *
 * const executor = new Executor();
 * await executor.fund(alice, 10n ** 18n);
 * const { address } = await executor.deploy({ from: alice, create });
 *
 * // Record a transaction, then evaluate a pointer at one of its steps
 * const trace = createTrace({ memory: "changed" });
 * await executor.call({ from: alice, to: address!, input }, trace);
 * const state = createMachineState(trace.stateAt(i));
 * const cursor = await dereference(pointer, { state });
 * ```
 */

// Executor
export { Executor } from "#executor";
export type {
  ExecutorOptions,
  ExecutionOptions,
  ExecutionResult,
  BlockOptions,
  DeployOptions,
  DeployResult,
  CallOptions,
} from "#executor";

// Machine state adapter
export { createMachineState } from "#machine";
export type { MachineStateOptions } from "#machine";

// Traces and Machine
export { createTrace, createMachine } from "#trace";
export type {
  TraceStep,
  StepState,
  StepStateWithoutMemory,
  TraceHandler,
  TraceOptions,
  RecordOptions,
  Trace,
  TraceFrame,
  MemoryPolicy,
  MessageFrame,
  FrameEvent,
  FrameHandler,
} from "#trace";
