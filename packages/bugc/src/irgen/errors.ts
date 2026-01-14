/**
 * IR generation errors and error codes
 */

import { BugError } from "#errors";
import { Severity } from "#result";
import type { SourceLocation } from "#ast";

/**
 * Error codes for IR errors
 */
export enum ErrorCode {
  INVALID_NODE = "IR001",
  UNKNOWN_IDENTIFIER = "IR002",
  INTERNAL_ERROR = "IR003",
  UNSUPPORTED_FEATURE = "IR004",
  INVALID_LVALUE = "IR005",
  STORAGE_ACCESS_ERROR = "IR006",
  UNKNOWN_TYPE = "IR007",
  INVALID_ARGUMENT_COUNT = "IR008",
  MISSING_RETURN = "IR009",
  GENERAL = "IR_ERROR", // Legacy support
}

/**
 * IR error message templates
 */
export const ErrorMessages = {
  UNKNOWN_IDENTIFIER: (name: string) => `Unknown identifier: ${name}`,
  STORAGE_MODIFICATION_ERROR: (varName: string, typeName: string) =>
    `Cannot modify storage through local variable '${varName}' of type ${typeName}. Direct storage access required for persistent changes.`,
  UNSUPPORTED_STORAGE_PATTERN: (pattern: string) =>
    `${pattern} in storage access not yet supported`,
} as const;

/**
 * IR generation errors
 */
class IrgenError extends BugError {
  constructor(
    message: string,
    location?: SourceLocation,
    severity: Severity = Severity.Error,
    code: ErrorCode = ErrorCode.GENERAL,
  ) {
    super(message, code, location, severity);
  }
}

export { IrgenError as Error };

export function assertExhausted(_: never): never {
  throw new IrgenError(
    `Unexpected code path; expected exhaustive conditionals`,
    undefined,
    Severity.Error,
    ErrorCode.INTERNAL_ERROR,
  );
}
