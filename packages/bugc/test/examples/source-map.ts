/**
 * Source Line Mapping
 *
 * Maps source code lines to bytecode instruction indices.
 */

import type * as Evm from "#evm";
import * as Format from "@ethdebug/format";

export interface SourceMapping {
  /** Map from source line number (1-indexed) to instruction indices */
  lineToInstructions: Map<number, number[]>;
  /** Byte offset for each instruction index */
  instructionOffsets: number[];
}

/**
 * Build a mapping from source lines to instruction indices.
 */
export function buildSourceMapping(
  source: string,
  instructions: Evm.Instruction[],
): SourceMapping {
  const lineOffsets = buildLineOffsets(source);
  const lineToInstructions = new Map<number, number[]>();
  const instructionOffsets = computeInstructionOffsets(instructions);

  for (let i = 0; i < instructions.length; i++) {
    const instr = instructions[i];
    const context = instr.debug?.context;

    if (!context) {
      continue;
    }

    // Get source range from code context
    const codeRange = getCodeRange(context);
    if (!codeRange) {
      continue;
    }

    // Map source byte range to line numbers
    const lines = sourceRangeToLines(codeRange, lineOffsets);

    for (const line of lines) {
      const existing = lineToInstructions.get(line) ?? [];
      if (!existing.includes(i)) {
        existing.push(i);
        lineToInstructions.set(line, existing);
      }
    }
  }

  return { lineToInstructions, instructionOffsets };
}

/**
 * Find all instruction indices that cover a given source line.
 */
export function findInstructionsAtLine(
  mapping: SourceMapping,
  line: number,
): number[] {
  return mapping.lineToInstructions.get(line) ?? [];
}

/**
 * Build a map from line number to [startOffset, endOffset].
 */
function buildLineOffsets(source: string): Map<number, [number, number]> {
  const lines = source.split("\n");
  const lineOffsets = new Map<number, [number, number]>();
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineStart = offset;
    const lineEnd = offset + lines[i].length;
    lineOffsets.set(i + 1, [lineStart, lineEnd]); // 1-indexed
    offset = lineEnd + 1; // +1 for newline
  }

  return lineOffsets;
}

/**
 * Compute byte offset for each instruction.
 */
function computeInstructionOffsets(instructions: Evm.Instruction[]): number[] {
  const offsets: number[] = [];
  let offset = 0;

  for (const instr of instructions) {
    offsets.push(offset);
    offset += 1 + (instr.immediates?.length ?? 0);
  }

  return offsets;
}

/**
 * Convert a Value (number or hex string) to a number.
 */
function valueToNumber(value: Format.Data.Value): number {
  if (typeof value === "number") {
    return value;
  }
  // Hex string
  return parseInt(value, 16);
}

/**
 * Extract source range from a context (handles gather/pick/code variants).
 */
function getCodeRange(
  context: Format.Program.Context,
): { offset: number; length: number } | null {
  // Direct code context
  if (Format.Program.Context.isCode(context)) {
    const range = context.code.range;
    if (!range) {
      return null;
    }
    return {
      offset: valueToNumber(range.offset),
      length: valueToNumber(range.length),
    };
  }

  // Gather context - check children
  if (Format.Program.Context.isGather(context)) {
    for (const child of context.gather) {
      const range = getCodeRange(child);
      if (range) {
        return range;
      }
    }
  }

  // Pick context - check all options
  if (Format.Program.Context.isPick(context)) {
    for (const option of context.pick) {
      const range = getCodeRange(option);
      if (range) {
        return range;
      }
    }
  }

  return null;
}

/**
 * Convert a source byte range to line numbers.
 */
function sourceRangeToLines(
  range: { offset: number; length: number },
  lineOffsets: Map<number, [number, number]>,
): number[] {
  const lines: number[] = [];
  const rangeEnd = range.offset + range.length;

  for (const [line, [start, end]] of lineOffsets) {
    // Check if ranges overlap
    if (range.offset <= end && rangeEnd >= start) {
      lines.push(line);
    }
  }

  return lines;
}
