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

// Also re-export utilities for convenience
export {
  computeOffsets,
  resolveDynamicInstruction,
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
} from "@ethdebug/programs-react";

// Local Docusaurus-specific components
export * from "./Viewer";
