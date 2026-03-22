/**
 * Utilities for extracting debug information from IR instructions.
 */

import type { Ir } from "@ethdebug/bugc";
import type { SourceRange } from "#types";
import { extractSourceRange } from "./debugUtils.js";

/**
 * Multi-level debug information extracted from IR elements.
 */
export interface MultiLevelDebugInfo {
  /** Debug info for the operation itself */
  operation?: Ir.Instruction.Debug | Ir.Block.Debug;
  /** Debug info for each operand */
  operands: { label: string; debug?: Ir.Instruction.Debug | Ir.Block.Debug }[];
}

/**
 * Extract all debug contexts from an IR instruction.
 *
 * @param instruction - The IR instruction
 * @returns Multi-level debug info with operation and operand contexts
 */
export function extractInstructionDebug(
  instruction: Ir.Instruction,
): MultiLevelDebugInfo {
  const operands: {
    label: string;
    debug?: Ir.Instruction.Debug | Ir.Block.Debug;
  }[] = [];

  switch (instruction.kind) {
    case "read":
      if (instruction.slot) {
        operands.push({ label: "slot", debug: instruction.slotDebug });
      }
      if (instruction.offset) {
        operands.push({ label: "offset", debug: instruction.offsetDebug });
      }
      if (instruction.length) {
        operands.push({ label: "length", debug: instruction.lengthDebug });
      }
      break;

    case "write":
      if (instruction.slot) {
        operands.push({ label: "slot", debug: instruction.slotDebug });
      }
      if (instruction.offset) {
        operands.push({ label: "offset", debug: instruction.offsetDebug });
      }
      if (instruction.length) {
        operands.push({ label: "length", debug: instruction.lengthDebug });
      }
      operands.push({ label: "value", debug: instruction.valueDebug });
      break;

    case "compute_offset":
      operands.push({ label: "base", debug: instruction.baseDebug });
      if ("index" in instruction && instruction.index) {
        operands.push({ label: "index", debug: instruction.indexDebug });
      }
      if ("offset" in instruction && instruction.offset) {
        operands.push({ label: "offset", debug: instruction.offsetDebug });
      }
      break;

    case "compute_slot":
      operands.push({ label: "base", debug: instruction.baseDebug });
      if ("key" in instruction && instruction.key) {
        operands.push({ label: "key", debug: instruction.keyDebug });
      }
      break;

    case "const":
      operands.push({ label: "value", debug: instruction.valueDebug });
      break;

    case "allocate":
      operands.push({ label: "size", debug: instruction.sizeDebug });
      break;

    case "binary":
      operands.push({ label: "left", debug: instruction.leftDebug });
      operands.push({ label: "right", debug: instruction.rightDebug });
      break;

    case "unary":
      operands.push({ label: "operand", debug: instruction.operandDebug });
      break;

    case "hash":
      operands.push({ label: "value", debug: instruction.valueDebug });
      break;

    case "cast":
      operands.push({ label: "value", debug: instruction.valueDebug });
      break;

    case "length":
      operands.push({ label: "object", debug: instruction.objectDebug });
      break;
  }

  return {
    operation: instruction.operationDebug,
    operands,
  };
}

/**
 * Extract all debug contexts from a terminator.
 *
 * @param terminator - The block terminator
 * @returns Multi-level debug info
 */
export function extractTerminatorDebug(
  terminator: Ir.Block.Terminator,
): MultiLevelDebugInfo {
  const operands: {
    label: string;
    debug?: Ir.Instruction.Debug | Ir.Block.Debug;
  }[] = [];

  switch (terminator.kind) {
    case "branch":
      operands.push({ label: "condition", debug: terminator.conditionDebug });
      break;

    case "return":
      if (terminator.value) {
        operands.push({ label: "value", debug: terminator.valueDebug });
      }
      break;

    case "call":
      if (terminator.argumentsDebug) {
        terminator.arguments.forEach((_, index) => {
          operands.push({
            label: `arg[${index}]`,
            debug: terminator.argumentsDebug?.[index],
          });
        });
      }
      break;
  }

  return {
    operation: terminator.operationDebug,
    operands,
  };
}

/**
 * Extract debug contexts from a phi node.
 *
 * @param phi - The phi instruction
 * @returns Multi-level debug info
 */
export function extractPhiDebug(phi: Ir.Block.Phi): MultiLevelDebugInfo {
  const operands: {
    label: string;
    debug?: Ir.Instruction.Debug | Ir.Block.Debug;
  }[] = [];

  if (phi.sourcesDebug) {
    for (const pred of phi.sources.keys()) {
      const debug = phi.sourcesDebug.get(pred);
      operands.push({ label: `from ${pred}`, debug });
    }
  }

  return {
    operation: phi.operationDebug,
    operands,
  };
}

/**
 * Format multi-level debug info as hierarchical JSON.
 *
 * @param info - The debug info to format
 * @returns Formatted JSON string
 */
export function formatMultiLevelDebug(info: MultiLevelDebugInfo): string {
  const result: Record<string, unknown> = {};

  if (info.operation?.context) {
    result.operation = info.operation.context;
  }

  const operandsWithDebug = info.operands.filter((op) => op.debug?.context);
  if (operandsWithDebug.length > 0) {
    result.operands = Object.fromEntries(
      operandsWithDebug.map((op) => [op.label, op.debug!.context]),
    );
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Extract all source ranges from multi-level debug info.
 *
 * @param info - The debug info
 * @returns Array of source ranges from all levels
 */
export function extractAllSourceRanges(
  info: MultiLevelDebugInfo,
): SourceRange[] {
  const ranges: SourceRange[] = [];

  // Operation debug
  if (info.operation?.context) {
    ranges.push(...extractSourceRange(info.operation.context));
  }

  // Operand debug
  for (const operand of info.operands) {
    if (operand.debug?.context) {
      ranges.push(...extractSourceRange(operand.debug.context));
    }
  }

  return ranges;
}

/**
 * Extract source ranges from a specific operand by label.
 *
 * @param info - The debug info
 * @param label - The operand label to look for
 * @returns Source ranges for the specified operand
 */
export function extractOperandSourceRanges(
  info: MultiLevelDebugInfo,
  label: string,
): SourceRange[] {
  const operand = info.operands.find((op) => op.label === label);
  if (!operand?.debug?.context) {
    return [];
  }
  return extractSourceRange(operand.debug.context);
}
