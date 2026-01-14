/**
 * Custom Vitest matchers for Result type assertions
 */
import { expect } from "vitest";

import { Result, Severity } from "#result";
import type { BugError } from "#errors";

interface CustomMatchers<R = unknown> {
  toHaveMessage(match: {
    severity?: Severity;
    code?: string;
    message?: string | RegExp;
    location?: { offset: number; length?: number };
  }): R;
  toHaveNoErrors(): R;
  toHaveOnlyWarnings(): R;
  toBeCleanSuccess(): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toHaveMessage<T, E extends BugError>(
    result: Result<T, E>,
    match: {
      severity?: Severity;
      code?: string;
      message?: string | RegExp;
      location?: { offset: number; length?: number };
    },
  ) {
    const found = Result.findMessage(result, match);

    if (!found) {
      const allMessages = Result.allMessages(result);
      let details = "";

      if (allMessages.length === 0) {
        details = "no messages found";
      } else {
        // Show messages of the requested severity (or all if not specified)
        const relevant = match.severity
          ? allMessages.filter((m) => m.severity === match.severity)
          : allMessages;

        if (relevant.length === 0) {
          details = `no ${match.severity} messages found`;
        } else {
          details = `found ${relevant.length} message(s):\n`;
          details += relevant
            .map(
              (m) =>
                `  - [${m.severity}] ${m.code}: ${m.message}${m.location ? ` at offset ${m.location.offset}` : ""}`,
            )
            .join("\n");
        }
      }

      return {
        pass: false,
        message: () =>
          `Expected message matching ${JSON.stringify(match)}, but ${details}`,
      };
    }

    return {
      pass: true,
      message: () =>
        `Expected not to have message matching ${JSON.stringify(match)}`,
    };
  },

  toHaveNoErrors<T, E extends BugError>(result: Result<T, E>) {
    const errors = Result.getMessages(result, Severity.Error);

    if (errors.length > 0) {
      const summary = errors
        .map((e) => `  - ${e.code}: ${e.message}`)
        .join("\n");

      return {
        pass: false,
        message: () =>
          `Expected no errors, but found ${errors.length}:\n${summary}`,
      };
    }

    return {
      pass: true,
      message: () => "Expected to have errors",
    };
  },

  toHaveOnlyWarnings<T, E extends BugError>(result: Result<T, E>) {
    const errors = Result.getMessages(result, Severity.Error);

    const warnings = Result.getMessages(result, Severity.Warning);

    if (errors.length > 0) {
      return {
        pass: false,
        message: () =>
          `Expected only warnings, but found ${errors.length} error(s)`,
      };
    }

    if (warnings.length === 0) {
      return {
        pass: false,
        message: () => "Expected warnings, but found none",
      };
    }

    return {
      pass: true,
      message: () => "Expected to have errors or no warnings",
    };
  },

  toBeCleanSuccess<T, E extends BugError>(result: Result<T, E>) {
    if (!result.success) {
      return {
        pass: false,
        message: () => "Expected successful result, but it failed",
      };
    }

    const messageCount = Result.countMessages(result);
    if (messageCount > 0) {
      return {
        pass: false,
        message: () =>
          `Expected clean success with no messages, but found ${messageCount} message(s)`,
      };
    }

    return {
      pass: true,
      message: () => "Expected failure or messages",
    };
  },
});
