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
 * import { Executor, createMachineState } from "@ethdebug/evm";
 * import { dereference } from "@ethdebug/pointers";
 *
 * // Create executor and deploy contract
 * const executor = new Executor();
 * await executor.deploy(bytecode);
 * await executor.execute();
 *
 * // Create machine state for pointer evaluation
 * const state = createMachineState(executor);
 * const cursor = await dereference(pointer, { state });
 * ```
 */

// Executor
export { Executor } from "#executor";
export type { ExecutionOptions, ExecutionResult } from "#executor";

// Machine state adapter
export { createMachineState } from "#machine";
export type { MachineStateOptions } from "#machine";

// Trace types
export { createTraceCollector } from "#trace";
export type { TraceStep, TraceHandler, Trace } from "#trace";
