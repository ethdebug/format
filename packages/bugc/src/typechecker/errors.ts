/**
 * Type checker errors and error codes
 */

import { BugError } from "#errors";
import { Severity } from "#result";
import type { SourceLocation } from "#ast";

/**
 * Error codes for type errors
 */
export enum ErrorCode {
  TYPE_MISMATCH = "TYPE001",
  UNDEFINED_VARIABLE = "TYPE002",
  UNDEFINED_TYPE = "TYPE003",
  INVALID_OPERATION = "TYPE004",
  MISSING_INITIALIZER = "TYPE005",
  INVALID_ASSIGNMENT = "TYPE006",
  INVALID_CONDITION = "TYPE007",
  INVALID_OPERAND = "TYPE008",
  NO_SUCH_FIELD = "TYPE009",
  INVALID_INDEX_TYPE = "TYPE010",
  NOT_INDEXABLE = "TYPE011",
  INVALID_ARGUMENT_COUNT = "TYPE012",
  INVALID_TYPE_CAST = "TYPE013",
  INTERNAL_ERROR = "TYPE014",
  GENERAL = "TYPE_ERROR", // Legacy support
}

/**
 * Type error message templates
 */
export const ErrorMessages = {
  TYPE_MISMATCH: (expected: string, actual: string) =>
    `Type mismatch: expected ${expected}, got ${actual}`,
  UNDEFINED_VARIABLE: (name: string) => `Undefined variable: ${name}`,
  UNDEFINED_TYPE: (name: string) => `Undefined type: ${name}`,
  INVALID_UNARY_OP: (op: string, type: string) =>
    `Operator ${op} requires ${type} operand`,
  INVALID_BINARY_OP: (op: string, type: string) =>
    `Operator ${op} requires ${type} operands`,
  NO_SUCH_FIELD: (structName: string, fieldName: string) =>
    `Struct ${structName} has no field ${fieldName}`,
  CANNOT_INDEX: (type: string) => `Cannot index ${type}`,
} as const;

class TypeError extends BugError {
  public readonly expectedType?: string;
  public readonly actualType?: string;

  constructor(
    message: string,
    location?: SourceLocation,
    expectedType?: string,
    actualType?: string,
    code: ErrorCode = ErrorCode.GENERAL,
  ) {
    super(message, code, location);
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

export { TypeError as Error };

export function assertExhausted(_: never): never {
  throw new TypeError(
    `Unexpected code path; expected exhaustive conditionals`,
    undefined,
    Severity.Error,
    ErrorCode.INTERNAL_ERROR,
  );
}
