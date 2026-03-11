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
  CallStackDisplay,
  CallInfoPanel,
  type TraceState,
  type TraceProviderProps,
  type ResolvedVariable,
  type ResolvedCallInfo,
  type ResolvedPointerRef,
  type TraceControlsProps,
  type TraceProgressProps,
  type VariableInspectorProps,
  type StackInspectorProps,
  type CallStackDisplayProps,
  type CallInfoPanelProps,
} from "@ethdebug/programs-react";

// Also re-export utilities for convenience
export {
  computeOffsets,
  resolveDynamicInstruction,
  createMockTrace,
  findInstructionAtPc,
  extractVariablesFromInstruction,
  extractCallInfoFromInstruction,
  buildPcToInstructionMap,
  buildCallStack,
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
  type TraceStep,
  type MockTraceSpec,
  type CallInfo,
  type CallFrame,
} from "@ethdebug/programs-react";

// Local Docusaurus-specific components
export * from "./Viewer";
export * from "./TraceViewer";

// Trace playground components
export * from "./TracePlaygroundContext";
export * from "./TracePlayground";
export * from "./TraceDrawer";
export * from "./TraceExample";
