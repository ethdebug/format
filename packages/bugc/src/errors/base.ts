import type { SourceLocation } from "#ast";
import { Severity } from "#result";

/**
 * Base class for all BUG compiler errors
 */
export abstract class BugError extends Error {
  public readonly code: string;
  public readonly location?: SourceLocation;
  public readonly severity: Severity;

  constructor(
    message: string,
    code: string,
    location?: SourceLocation,
    severity: Severity = Severity.Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.location = location;
    this.severity = severity;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Format the error with location information
   */
  toString(): string {
    const severityPrefix =
      this.severity === Severity.Error ? "Error" : "Warning";
    const codePrefix = `[${this.code}]`;

    if (this.location) {
      return `${severityPrefix} ${codePrefix}: ${this.message} at offset ${this.location.offset}`;
    }

    return `${severityPrefix} ${codePrefix}: ${this.message}`;
  }
}
