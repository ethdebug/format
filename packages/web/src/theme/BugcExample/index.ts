// Re-export from @ethdebug/bugc-react
export {
  // Components
  Editor,
  AstView,
  IrView,
  CfgView,
  BytecodeView,
  EthdebugTooltip,
  DebugInfoIcon,

  // Hooks
  useEthdebugTooltip,

  // Types
  type SourceRange,
  type BytecodeOutput,
  type CompileResult,
  type TooltipData,
} from "@ethdebug/bugc-react";

// Utilities
export {
  extractSourceRange,
  formatDebugContext,
  hasSourceRange,
  extractInstructionDebug,
  extractTerminatorDebug,
  extractPhiDebug,
  formatMultiLevelDebug,
  extractAllSourceRanges,
  extractOperandSourceRanges,
  formatBytecode,
  getOpcodeName,
  OPCODES,
  registerBugLanguage,
  bugKeywords,
  bugTypeKeywords,
  bugOperators,
  bugLanguageId,
  bugMonarchTokensProvider,
  bugLanguageConfiguration,
} from "@ethdebug/bugc-react";

// Local Docusaurus-specific components
export * from "./BugPlayground";
