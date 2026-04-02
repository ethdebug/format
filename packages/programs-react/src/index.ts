/**
 * @ethdebug/programs-react
 *
 * React components for visualizing ethdebug program annotations.
 */

// Components
export {
  ProgramExampleContextProvider,
  useProgramExampleContext,
  type ProgramExampleState,
  type ProgramExampleProps,
} from "#components/ProgramExampleContext";

export { Opcodes } from "#components/Opcodes";

export { SourceContents } from "#components/SourceContents";

export { HighlightedInstruction } from "#components/HighlightedInstruction";

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
  type ResolvedCallFrame,
  type ResolvedPointerRef,
  type TraceControlsProps,
  type TraceProgressProps,
  type VariableInspectorProps,
  type StackInspectorProps,
  type CallStackDisplayProps,
  type CallInfoPanelProps,
} from "#components/index";

// Shiki utilities
export {
  useHighlighter,
  ShikiCodeBlock,
  type Highlighter,
  type HighlightOptions,
  type ShikiCodeBlockProps,
} from "#shiki/index";

// Utility functions
export {
  computeOffsets,
  resolveDynamicInstruction,
  createMockTrace,
  findInstructionAtPc,
  extractVariablesFromInstruction,
  extractCallInfoFromInstruction,
  buildPcToInstructionMap,
  buildCallStack,
  type CallInfo,
  type CallFrame,
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
  type FindSourceRangeOptions,
  type ResolverOptions,
  traceStepToMachineState,
  type TraceStep,
  type MockTraceSpec,
} from "#utils/index";

// CSS - consumers should import these stylesheets
// import "@ethdebug/programs-react/components/Opcodes.css";
// import "@ethdebug/programs-react/components/SourceContents.css";
// import "@ethdebug/programs-react/components/TraceControls.css";
// import "@ethdebug/programs-react/components/VariableInspector.css";
// import "@ethdebug/programs-react/components/CallStackDisplay.css";
// import "@ethdebug/programs-react/components/CallInfoPanel.css";
