/**
 * Utilities for extracting debug information from ethdebug format contexts.
 */

import type { SourceRange } from "#types";

/**
 * Extract source ranges from an ethdebug format context object.
 *
 * Handles various context types including:
 * - code: Direct source range
 * - gather: Multiple code regions
 * - pick: Conditional selection
 * - frame: Nested context
 *
 * @param context - The ethdebug context object
 * @returns Array of source ranges
 */
export function extractSourceRange(
  context: unknown | undefined,
): SourceRange[] {
  if (!context || typeof context !== "object") {
    return [];
  }

  const ctx = context as Record<string, unknown>;

  // Handle "code" context - direct source mapping
  if (ctx.code && typeof ctx.code === "object") {
    const code = ctx.code as Record<string, unknown>;
    if (code.range && typeof code.range === "object") {
      const range = code.range as Record<string, number>;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        return [{ offset: range.offset, length: range.length }];
      }
    }
  }

  // Handle "gather" context - multiple code regions
  if (ctx.gather && Array.isArray(ctx.gather)) {
    const ranges: SourceRange[] = [];
    for (const item of ctx.gather) {
      ranges.push(...extractSourceRange(item));
    }
    return ranges;
  }

  // Handle "pick" context - select one from options
  if (ctx.pick && Array.isArray(ctx.pick)) {
    // For now, just return all possible ranges
    const ranges: SourceRange[] = [];
    for (const item of ctx.pick) {
      ranges.push(...extractSourceRange(item));
    }
    return ranges;
  }

  // Handle "frame" context - nested context
  if (ctx.frame && typeof ctx.frame === "object") {
    return extractSourceRange(ctx.frame);
  }

  // Try to extract from nested context property
  if (ctx.context) {
    return extractSourceRange(ctx.context);
  }

  return [];
}

/**
 * Format an ethdebug context object as a readable JSON string.
 *
 * @param context - The context object to format
 * @returns Formatted JSON string
 */
export function formatDebugContext(context: unknown): string {
  if (!context) {
    return "";
  }
  return JSON.stringify(context, null, 2);
}

/**
 * Check if a context contains source range information.
 *
 * @param context - The context to check
 * @returns True if the context contains source ranges
 */
export function hasSourceRange(context: unknown): boolean {
  return extractSourceRange(context).length > 0;
}
