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
  type DynamicInstruction,
  type DynamicContext,
  type ContextThunk,
  type FindSourceRangeOptions,
  type ResolverOptions,
} from "#utils/index";

// CSS - consumers should import these stylesheets
// import "@ethdebug/programs-react/components/Opcodes.css";
// import "@ethdebug/programs-react/components/SourceContents.css";
