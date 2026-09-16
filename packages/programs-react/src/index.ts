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
  extractTransformFromInstruction,
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
  effectiveContextForStep,
  type EffectiveContextInput,
  type TraceStep,
  type MockTraceSpec,
} from "#utils/index";

// CSS - consumers should import the stylesheets they need; the
// package ships them under dist/src/components/, for example:
// import "@ethdebug/programs-react/dist/src/components/Opcodes.css";
// Available: Opcodes.css, SourceContents.css, TraceControls.css,
//   VariableInspector.css, CallStackDisplay.css, CallInfoPanel.css
