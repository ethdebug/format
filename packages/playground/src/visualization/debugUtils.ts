import type { Evm } from "@ethdebug/bugc";

export interface SourceRange {
  offset: number;
  length: number;
}

/**
 * Minimal types from ethdebug/format needed for extracting source ranges
 */
type CodeContext = {
  code: {
    range: {
      offset: number;
      length: number;
    };
  };
};

type GatherContext = {
  gather: Context[];
};

type PickContext = {
  pick: Context[];
};

type FrameContext = {
  frame: {
    context: Context;
  };
};

type Context = CodeContext | GatherContext | PickContext | FrameContext;

/**
 * Extract source ranges from a debug context, handling nondeterminism
 * in "pick" contexts as per ethdebug format specification.
 *
 * When multiple alternatives exist (via "pick"), returns all valid
 * source ranges so they can be displayed simultaneously.
 *
 * Returns an array where:
 * - First element is the "primary" location (shown in one color)
 * - Remaining elements are "alternative" locations (shown in another color)
 */
export function extractSourceRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any | undefined,
): SourceRange[] {
  if (!context) {
    return [];
  }

  // Handle "code" context directly
  if ("code" in context && context.code?.range) {
    return [
      {
        offset: context.code.range.offset,
        length: context.code.range.length,
      },
    ];
  }

  // Handle "gather" context (multiple simultaneous contexts)
  if ("gather" in context && Array.isArray(context.gather)) {
    const allRanges: SourceRange[] = [];
    for (const subContext of context.gather) {
      const ranges = extractSourceRange(subContext);
      allRanges.push(...ranges);
    }
    if (allRanges.length > 0) {
      return allRanges;
    }
  }

  // Handle "pick" context (alternative contexts - collect ALL valid ones)
  if ("pick" in context && Array.isArray(context.pick)) {
    const allRanges: SourceRange[] = [];
    for (const alternative of context.pick) {
      const ranges = extractSourceRange(alternative);
      allRanges.push(...ranges);
    }
    if (allRanges.length > 0) {
      return allRanges;
    }
  }

  // Handle "frame" context (compilation stage context)
  if ("frame" in context && context.frame?.context) {
    return extractSourceRange(context.frame.context);
  }

  return [];
}

/**
 * Build a map from bytecode position to instruction with debug info
 */
export function buildInstructionMap(
  instructions: Evm.Instruction[],
): Map<number, Evm.Instruction> {
  const map = new Map<number, Evm.Instruction>();
  let position = 0;

  for (const instruction of instructions) {
    map.set(position, instruction);

    // Move position forward by 1 (opcode) + immediates length
    position += 1 + (instruction.immediates?.length || 0);
  }

  return map;
}
