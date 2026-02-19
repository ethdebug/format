/**
 * Type definitions for @ethdebug/bugc-react components.
 */

import type { Ast, Ir, Evm } from "@ethdebug/bugc";

/**
 * Represents a source range in the original code.
 */
export interface SourceRange {
  /** Starting byte offset */
  offset: number;
  /** Length in bytes */
  length: number;
}

/**
 * Output from bytecode compilation.
 */
export interface BytecodeOutput {
  /** Runtime bytecode */
  runtime: Uint8Array;
  /** Creation bytecode (optional) */
  create?: Uint8Array;
  /** Disassembled runtime instructions */
  runtimeInstructions: Evm.Instruction[];
  /** Disassembled creation instructions (optional) */
  createInstructions?: Evm.Instruction[];
}

/**
 * Successful compilation result.
 */
export interface SuccessfulCompileResult {
  success: true;
  ast: Ast.Program;
  ir: Ir.Module;
  bytecode: BytecodeOutput;
  warnings: string[];
}

/**
 * Failed compilation result.
 */
export interface FailedCompileResult {
  success: false;
  error: string;
  ast?: Ast.Program;
  warnings?: string[];
}

/**
 * Union of compilation results.
 */
export type CompileResult = SuccessfulCompileResult | FailedCompileResult;

/**
 * Tooltip data for EthdebugTooltip component.
 */
export interface TooltipData {
  /** Content to display */
  content: string;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Whether the tooltip is pinned */
  pinned?: boolean;
}

/**
 * State returned by useEthdebugTooltip hook.
 */
export interface TooltipState {
  /** Current tooltip data, if any */
  tooltip: TooltipData | null;
  /** Show tooltip at position */
  showTooltip: (content: string, x: number, y: number) => void;
  /** Hide the tooltip */
  hideTooltip: () => void;
  /** Pin the tooltip in place */
  pinTooltip: () => void;
  /** Unpin the tooltip */
  unpinTooltip: () => void;
  /** Whether the tooltip is currently pinned */
  isPinned: boolean;
}
