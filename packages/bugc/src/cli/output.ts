/**
 * CLI output and display utilities
 */
/* eslint-disable no-console */

import { writeFileSync } from "fs";
import type { BugError } from "#errors";
import { Severity, type MessagesBySeverity } from "#result";
import { formatError } from "./error-formatter.js";

/**
 * Display compilation errors to stderr
 */
export function displayErrors(
  messages: MessagesBySeverity<BugError>,
  source: string,
): void {
  const errors = messages[Severity.Error] || [];
  if (errors.length > 0) {
    console.error("Compilation failed:\n");
    for (const error of errors) {
      console.error(formatError(error, source));
    }
  }
}

/**
 * Display compilation warnings to stderr
 */
export function displayWarnings(
  messages: MessagesBySeverity<BugError>,
  source: string,
): void {
  const warnings = messages[Severity.Warning] || [];
  if (warnings.length > 0) {
    console.error("Warnings:\n");
    for (const warning of warnings) {
      console.error(formatError(warning, source));
    }
    console.error("");
  }
}

/**
 * Write output to file or stdout
 */
export function writeOutput(
  content: string,
  options: { output?: string; message?: string },
): void {
  if (options.output) {
    writeFileSync(options.output, content);
    console.log(options.message || `Output written to ${options.output}`);
  } else {
    console.log(content);
  }
}

/**
 * Exit with error message
 */
export function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}
