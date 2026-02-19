/**
 * Component exports.
 */

export {
  ProgramExampleContextProvider,
  useProgramExampleContext,
  type ProgramExampleState,
  type ProgramExampleProps,
} from "./ProgramExampleContext.js";

export { Opcodes } from "./Opcodes.js";

export { SourceContents } from "./SourceContents.js";

export { HighlightedInstruction } from "./HighlightedInstruction.js";

// Trace components
export {
  TraceProvider,
  useTraceContext,
  type TraceState,
  type TraceProviderProps,
  type ResolvedVariable,
} from "./TraceContext.js";

export {
  TraceControls,
  TraceProgress,
  type TraceControlsProps,
  type TraceProgressProps,
} from "./TraceControls.js";

export {
  VariableInspector,
  StackInspector,
  type VariableInspectorProps,
  type StackInspectorProps,
} from "./VariableInspector.js";
