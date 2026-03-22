/**
 * EVM instruction formatting utilities
 */

import * as Format from "@ethdebug/format";

import type { Instruction, InstructionDebug } from "#evm/spec";
import { Analysis as AstAnalysis } from "#ast";

/**
 * Formats EVM instructions for display
 */
export class EvmFormatter {
  /**
   * Format instruction objects as assembly text
   */
  static formatInstructions(
    instructions: Instruction[],
    source?: string,
  ): string {
    const lines: string[] = [];
    let offset = 0;

    for (const inst of instructions) {
      // Add source comment if debug info exists
      const sourceComment = this.formatSourceComment(inst.debug, source);
      if (sourceComment) {
        lines.push(sourceComment);
      }

      // Format the instruction
      let line = `${offset.toString().padStart(4, "0")}: ${inst.mnemonic}`;
      if (inst.immediates && inst.immediates.length > 0) {
        const dataHex = inst.immediates
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        line += ` 0x${dataHex}`;
      }

      lines.push(line);

      // Update offset for next instruction
      offset += 1 + (inst.immediates?.length || 0);
    }

    return lines.join("\n");
  }

  /**
   * Format debug information as source comment
   */
  private static formatSourceComment(
    debug?: InstructionDebug,
    source?: string,
  ): string {
    if (!debug?.context || !source) {
      return "";
    }

    const context = debug.context;

    // Handle pick context - show all source locations on one line
    if ("pick" in context && Array.isArray(context.pick)) {
      const locations: string[] = [];
      for (const pickContext of context.pick) {
        const location = this.extractSourceLocation(pickContext, source);
        if (location) {
          locations.push(location);
        }
      }
      if (locations.length > 0) {
        return `; source: ${locations.join(" or ")}`;
      }
      return "";
    }

    // Handle direct code context
    return this.formatContextSourceComment(context, source);
  }

  /**
   * Format a single context as source comment
   */
  private static formatContextSourceComment(
    context: Format.Program.Context | undefined,
    source: string,
  ): string {
    if (!context) {
      return "";
    }

    const parts: string[] = [];

    // Check for remark (ethdebug format)
    if (Format.Program.Context.isRemark(context)) {
      parts.push(`; ${context.remark}`);
    }

    // Check for code.range (ethdebug format)
    if (Format.Program.Context.isCode(context) && context.code.range) {
      const range = context.code.range;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        // Convert to AST SourceLocation format for the existing formatter
        const loc = {
          offset: range.offset,
          length: range.length,
        };
        const sourceComment = AstAnalysis.formatSourceComment(loc, source);
        if (sourceComment) {
          parts.push(sourceComment);
        }
      }
    }

    return parts.join("\n");
  }

  /**
   * Extract just the location part from a context (for pick contexts)
   */
  private static extractSourceLocation(
    context: Format.Program.Context | undefined,
    source: string,
  ): string | null {
    if (!context) {
      return null;
    }

    // Check for code.range (ethdebug format)
    if (Format.Program.Context.isCode(context) && context.code.range) {
      const range = context.code.range;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        // Convert to AST SourceLocation format and extract just the location
        const loc = {
          offset: range.offset,
          length: range.length,
        };
        const fullComment = AstAnalysis.formatSourceComment(loc, source);
        // Extract just the location part (e.g., "16:3-11" from "; source: 16:3-11")
        const match = fullComment.match(/; source: (.+)/);
        return match ? match[1] : null;
      }
    }

    return null;
  }
}
