/**
 * Result type for compiler operations with severity-based message organization
 */

import type { BugError } from "#errors";

/**
 * Message severity levels
 */
export enum Severity {
  Error = "error",
  Warning = "warning",
  // Easy to extend with: Info = "info", Debug = "debug", etc.
}

/**
 * Messages organized by severity level
 */
export type MessagesBySeverity<E> = {
  [K in Severity]?: E[];
};

/**
 * Result type that tracks success/failure with categorized messages
 */
export type Result<T, E extends BugError = BugError> =
  | {
      success: true;
      value: T;
      messages: MessagesBySeverity<E>;
    }
  | {
      success: false;
      messages: MessagesBySeverity<E>;
    };

/**
 * Helper functions for working with Results
 */
export const Result = {
  /**
   * Create a successful result with no messages
   */
  ok<T, E extends BugError = BugError>(value: T): Result<T, E> {
    return { success: true, value, messages: {} };
  },

  /**
   * Create a successful result with messages
   */
  okWith<T, E extends BugError>(value: T, messages: E[]): Result<T, E> {
    return Result.addMessages(Result.ok(value), messages);
  },

  /**
   * Create a failed result with error messages
   */
  err<T, E extends BugError>(errors: E | E[]): Result<T, E> {
    const errorArray = Array.isArray(errors) ? errors : [errors];
    return {
      success: false,
      messages: { [Severity.Error]: errorArray },
    };
  },

  /**
   * Transform the value of a successful result
   */
  map<T, U, E extends BugError>(
    result: Result<T, E>,
    transform: (value: T) => U,
  ): Result<U, E> {
    if (!result.success) {
      return result as Result<U, E>;
    }

    return {
      ...result,
      value: transform(result.value),
    };
  },

  /**
   * Add messages to an existing result
   */
  addMessages<T, E extends BugError>(
    result: Result<T, E>,
    newMessages: E[],
  ): Result<T, E> {
    const messages = { ...result.messages };

    for (const msg of newMessages) {
      const severity = msg.severity;
      if (!messages[severity]) {
        messages[severity] = [];
      }
      messages[severity]!.push(msg);
    }

    return { ...result, messages };
  },

  /**
   * Merge messages from two MessagesBySeverity objects
   */
  mergeMessages<E extends BugError>(
    a: MessagesBySeverity<E>,
    b: MessagesBySeverity<E>,
  ): MessagesBySeverity<E> {
    const merged: MessagesBySeverity<E> = { ...a };

    for (const [severity, messages] of Object.entries(b) as [Severity, E[]][]) {
      if (!merged[severity]) {
        merged[severity] = [];
      }
      merged[severity]!.push(...messages);
    }

    return merged;
  },

  /**
   * Check if a result has error messages
   */
  hasErrors<T, E extends BugError>(result: Result<T, E>): boolean {
    return (result.messages[Severity.Error]?.length ?? 0) > 0;
  },

  /**
   * Check if a result has warning messages
   */
  hasWarnings<T, E extends BugError>(result: Result<T, E>): boolean {
    return (result.messages[Severity.Warning]?.length ?? 0) > 0;
  },

  /**
   * Get all messages from a result as a flat array
   */
  allMessages<T, E extends BugError>(result: Result<T, E>): E[] {
    return Object.values(result.messages).flat() as E[];
  },

  /**
   * Get messages by severity
   */
  getMessages<T, E extends BugError>(
    result: Result<T, E>,
    severity: Severity,
  ): E[] {
    return result.messages[severity] || [];
  },

  /**
   * Get the first error from a result (useful for tests)
   */
  firstError<T, E extends BugError>(result: Result<T, E>): E | undefined {
    const errors = result.messages[Severity.Error];
    return errors?.[0];
  },

  /**
   * Get the first message of any severity
   */
  firstMessage<T, E extends BugError>(result: Result<T, E>): E | undefined {
    const allMessages = Result.allMessages(result);
    return allMessages[0];
  },

  /**
   * Count messages by severity
   */
  countBySeverity<T, E extends BugError>(
    result: Result<T, E>,
    severity: Severity,
  ): number {
    return result.messages[severity]?.length ?? 0;
  },

  /**
   * Count messages matching criteria
   */
  countMessages<T, E extends BugError>(
    result: Result<T, E>,
    match?: {
      severity?: Severity;
      code?: string;
    },
  ): number {
    if (!match) {
      return Result.allMessages(result).length;
    }
    return Result.findMessages(result, match).length;
  },

  /**
   * Find a single message matching criteria
   */
  findMessage<T, E extends BugError>(
    result: Result<T, E>,
    match: {
      severity?: Severity;
      code?: string;
      message?: string | RegExp;
      location?: { offset: number; length?: number };
    },
  ): E | undefined {
    return Result.allMessages(result).find((e) => {
      if (match.severity !== undefined && e.severity !== match.severity)
        return false;
      if (match.code && e.code !== match.code) return false;

      if (match.message) {
        const matches =
          typeof match.message === "string"
            ? e.message.includes(match.message)
            : match.message.test(e.message);
        if (!matches) return false;
      }

      if (match.location) {
        if (!e.location) return false;
        if (e.location.offset !== match.location.offset) return false;
        if (
          match.location.length !== undefined &&
          e.location.length !== match.location.length
        )
          return false;
      }

      return true;
    });
  },

  /**
   * Find all messages matching criteria
   */
  findMessages<T, E extends BugError>(
    result: Result<T, E>,
    match: {
      severity?: Severity;
      code?: string;
      message?: string | RegExp;
      location?: { offset: number; length?: number };
    },
  ): E[] {
    return Result.allMessages(result).filter((e) => {
      if (match.severity !== undefined && e.severity !== match.severity)
        return false;
      if (match.code && e.code !== match.code) return false;

      if (match.message) {
        const matches =
          typeof match.message === "string"
            ? e.message.includes(match.message)
            : match.message.test(e.message);
        if (!matches) return false;
      }

      if (match.location) {
        if (!e.location) return false;
        if (e.location.offset !== match.location.offset) return false;
        if (
          match.location.length !== undefined &&
          e.location.length !== match.location.length
        )
          return false;
      }

      return true;
    });
  },

  /**
   * Check if any message matches criteria
   */
  hasMessage<T, E extends BugError>(
    result: Result<T, E>,
    match: {
      severity?: Severity;
      code?: string;
      message?: string | RegExp;
      location?: { offset: number; length?: number };
    },
  ): boolean {
    return Result.findMessage(result, match) !== undefined;
  },

  /**
   * Check if result has any messages
   */
  hasMessages<T, E extends BugError>(result: Result<T, E>): boolean {
    return Result.countMessages(result) > 0;
  },

  /**
   * Get errors only (convenience for common pattern)
   */
  errors<T, E extends BugError>(result: Result<T, E>): E[] {
    return Result.getMessages(result, Severity.Error);
  },

  /**
   * Get warnings only (convenience for common pattern)
   */
  warnings<T, E extends BugError>(result: Result<T, E>): E[] {
    return Result.getMessages(result, Severity.Warning);
  },

  /**
   * Count errors in the result
   */
  countErrors<T, E extends BugError>(result: Result<T, E>): number {
    return Result.errors(result).length;
  },
};
