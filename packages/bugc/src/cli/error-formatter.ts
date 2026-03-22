/**
 * Error formatting utilities for CLI display
 */

import type { SourceLocation } from "#ast";
import type { BugError } from "#errors";
import { Severity, type MessagesBySeverity } from "#result";

/**
 * Format a source location for display
 */
export function formatLocation(location: SourceLocation): string {
  return `offset ${location.offset}, length ${location.length}`;
}

/**
 * Format messages organized by severity
 */
export function formatMessages<E extends BugError>(
  messages: MessagesBySeverity<E>,
  source?: string,
): string {
  const output: string[] = [];

  // Format errors first
  const errors = messages[Severity.Error] || [];
  for (const error of errors) {
    output.push(formatError(error, source));
  }

  // Then warnings
  const warnings = messages[Severity.Warning] || [];
  for (const warning of warnings) {
    output.push(formatWarning(warning, source));
  }

  return output.join("\n\n");
}

/**
 * Format an error for CLI display
 */
export function formatError(error: BugError, source?: string): string {
  const icon = error.severity === Severity.Error ? "❌" : "⚠️";
  const severityText = error.severity === Severity.Error ? "Error" : "Warning";

  let output = `${icon} ${severityText} [${error.code}]: ${error.message}`;

  if (error.location) {
    output += `\n   at ${formatLocation(error.location)}`;

    // If we have source code, show the relevant snippet
    if (source) {
      const snippet = getSourceSnippet(source, error.location);
      if (snippet) {
        output += `\n${snippet}`;
      }
    }
  }

  if (error.stack) {
    output += `\n${error.stack.split("\n").slice(1, 4).join("\n")}`;
  }

  return output;
}

/**
 * Format a warning (convenience function)
 */
export function formatWarning(warning: BugError, source?: string): string {
  return formatError(warning, source);
}

/**
 * Get a source code snippet around an error location
 */
export function getSourceSnippet(
  source: string,
  location: SourceLocation,
): string | null {
  const lines = source.split("\n");
  const { offset, length } = location;

  // Find which line the error starts on
  let currentOffset = 0;
  let lineNumber = 0;
  let columnNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1; // +1 for newline

    if (currentOffset + lineLength > Number(offset)) {
      lineNumber = i;
      columnNumber = Number(offset) - currentOffset;
      break;
    }

    currentOffset += lineLength;
  }

  if (lineNumber >= lines.length) {
    return null;
  }

  // Show the line with the error
  const line = lines[lineNumber];
  const lineNumberStr = String(lineNumber + 1).padStart(4, " ");

  let output = `\n${lineNumberStr} | ${line}\n`;
  output += "     | ";

  // Add the error indicator
  output += " ".repeat(columnNumber);
  output += "^".repeat(Math.min(Number(length), line.length - columnNumber));

  return output;
}
