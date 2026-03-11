/**
 * Utility exports.
 */

export { computeOffsets } from "./offsets.js";

export {
  resolveDynamicInstruction,
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
  type FindSourceRangeOptions,
  type ResolverOptions,
} from "./dynamic.js";

export {
  createMockTrace,
  findInstructionAtPc,
  extractVariablesFromInstruction,
  extractCallInfoFromInstruction,
  buildPcToInstructionMap,
  buildCallStack,
  type TraceStep,
  type MockTraceSpec,
  type CallInfo,
  type CallFrame,
} from "./mockTrace.js";

export { traceStepToMachineState } from "./traceState.js";
