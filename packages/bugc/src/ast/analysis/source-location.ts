import type { SourceLocation } from "#ast/spec";

/**
 * Converts a byte offset to line and column position in source text
 */
export function offsetToLineCol(
  source: string,
  offset: number,
): { line: number; col: number } {
  let line = 1;
  let col = 1;

  for (let i = 0; i < Math.min(offset, source.length); i++) {
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  return { line, col };
}

/**
 * Formats a source location as a human-readable string
 */
export function formatSourceLocation(
  loc: SourceLocation | undefined,
  source?: string,
): string {
  if (!loc) {
    return "";
  }

  if (source) {
    const offset =
      typeof loc.offset === "string" ? parseInt(loc.offset, 10) : loc.offset;
    const length =
      typeof loc.length === "string" ? parseInt(loc.length, 10) : loc.length;
    const start = offsetToLineCol(source, offset);
    const end = offsetToLineCol(source, offset + length);

    if (start.line === end.line) {
      return `${start.line}:${start.col}-${end.col}`;
    } else {
      return `${start.line}:${start.col}-${end.line}:${end.col}`;
    }
  } else {
    return `offset ${loc.offset}, length ${loc.length}`;
  }
}

/**
 * Formats a source location as a comment for IR output
 */
export function formatSourceComment(
  loc: SourceLocation | undefined,
  source?: string,
): string {
  if (!loc) {
    return "";
  }

  const formatted = formatSourceLocation(loc, source);
  return formatted ? `; source: ${formatted}` : "";
}
