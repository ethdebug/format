// Re-export from @ethdebug/programs-react
export {
  ProgramExampleContextProvider,
  useProgramExampleContext,
  type ProgramExampleState,
  type ProgramExampleProps,
  SourceContents,
  Opcodes,
  HighlightedInstruction,
} from "@ethdebug/programs-react";

// Trace components
export {
  TraceProvider,
  useTraceContext,
  TraceControls,
  TraceProgress,
  VariableInspector,
  StackInspector,
  type TraceState,
  type TraceProviderProps,
  type ResolvedVariable,
  type TraceControlsProps,
  type TraceProgressProps,
  type VariableInspectorProps,
  type StackInspectorProps,
} from "@ethdebug/programs-react";

// Also re-export utilities for convenience
export {
  computeOffsets,
  resolveDynamicInstruction,
  createMockTrace,
  findInstructionAtPc,
  extractVariablesFromInstruction,
  buildPcToInstructionMap,
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
  type TraceStep,
  type MockTraceSpec,
} from "@ethdebug/programs-react";

// Local Docusaurus-specific components
export * from "./Viewer";
export * from "./TraceViewer";
