/**
 * @ethdebug/bugc-react
 *
 * React components for visualizing BUG compiler output.
 *
 * @packageDocumentation
 */

// Types
export type {
  SourceRange,
  BytecodeOutput,
  SuccessfulCompileResult,
  FailedCompileResult,
  CompileResult,
  TooltipData,
  TooltipState,
} from "./types.js";

// Hooks
export { useEthdebugTooltip } from "#hooks/useEthdebugTooltip";
export type { UseEthdebugTooltipResult } from "#hooks/useEthdebugTooltip";

// Components
export {
  EthdebugTooltip,
  DebugInfoIcon,
  DebugInfoSpacer,
  type EthdebugTooltipProps,
  type DebugInfoIconProps,
} from "#components/EthdebugTooltip";

export { BytecodeView, type BytecodeViewProps } from "#components/BytecodeView";

export { AstView, type AstViewProps } from "#components/AstView";

export { IrView, type IrViewProps } from "#components/IrView";

export { CfgView, type CfgViewProps } from "#components/CfgView";

export {
  Editor,
  type EditorProps,
  type EditorSourceRange,
} from "#components/Editor";

// Utilities
export {
  // Debug utilities
  extractSourceRange,
  formatDebugContext,
  hasSourceRange,
  // IR debug utilities
  extractInstructionDebug,
  extractTerminatorDebug,
  extractPhiDebug,
  formatMultiLevelDebug,
  extractAllSourceRanges,
  extractOperandSourceRanges,
  type MultiLevelDebugInfo,
  // Bytecode utilities
  formatBytecode,
  getOpcodeName,
  OPCODES,
  // BUG language utilities
  bugKeywords,
  bugTypeKeywords,
  bugOperators,
  bugLanguageId,
  bugMonarchTokensProvider,
  bugLanguageConfiguration,
  registerBugLanguage,
} from "#utils/index";
