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
  buildPcToInstructionMap,
  type TraceStep,
  type MockTraceSpec,
} from "./mockTrace.js";
