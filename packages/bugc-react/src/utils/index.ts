/**
 * Utility exports for @ethdebug/bugc-react.
 */

export {
  extractSourceRange,
  formatDebugContext,
  hasSourceRange,
} from "./debugUtils.js";

export {
  extractInstructionDebug,
  extractTerminatorDebug,
  extractPhiDebug,
  formatMultiLevelDebug,
  extractAllSourceRanges,
  extractOperandSourceRanges,
  type MultiLevelDebugInfo,
} from "./irDebugUtils.js";

export { formatBytecode, getOpcodeName, OPCODES } from "./formatBytecode.js";

export {
  keywords as bugKeywords,
  typeKeywords as bugTypeKeywords,
  operators as bugOperators,
  languageId as bugLanguageId,
  monarchTokensProvider as bugMonarchTokensProvider,
  languageConfiguration as bugLanguageConfiguration,
  registerBugLanguage,
} from "./bugLanguage.js";
