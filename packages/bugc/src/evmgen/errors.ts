import { BugError } from "#errors";
import type { SourceLocation } from "#ast";
import { Severity } from "#result";

export enum ErrorCode {
  STACK_OVERFLOW = "EVM001",
  STACK_UNDERFLOW = "EVM002",
  INVALID_STACK_ACCESS = "EVM003",
  MEMORY_ALLOCATION_FAILED = "EVM004",
  JUMP_TARGET_NOT_FOUND = "EVM005",
  PHI_NODE_UNRESOLVED = "EVM006",
  UNSUPPORTED_INSTRUCTION = "EVM007",
  INTERNAL_ERROR = "EVM999",
}

export const ErrorMessages = {
  [ErrorCode.STACK_OVERFLOW]: "Stack depth exceeds EVM limit of 1024",
  [ErrorCode.STACK_UNDERFLOW]:
    "Stack underflow: attempted to access non-existent stack item",
  [ErrorCode.INVALID_STACK_ACCESS]:
    "Invalid stack access: position out of range",
  [ErrorCode.MEMORY_ALLOCATION_FAILED]: "Failed to allocate memory for value",
  [ErrorCode.JUMP_TARGET_NOT_FOUND]: "Jump target block not found",
  [ErrorCode.PHI_NODE_UNRESOLVED]:
    "Phi node value not resolved for predecessor",
  [ErrorCode.UNSUPPORTED_INSTRUCTION]: "Unsupported IR instruction",
  [ErrorCode.INTERNAL_ERROR]: "Internal code generation error",
};

class EvmgenError extends BugError {
  constructor(
    code: ErrorCode,
    message?: string,
    location?: SourceLocation,
    severity: Severity = Severity.Error,
  ) {
    const baseMessage = ErrorMessages[code];
    const fullMessage = message ? `${baseMessage}: ${message}` : baseMessage;
    super(fullMessage, code, location, severity);
  }
}

export function assertExhausted(_: never) {
  throw new EvmgenError(
    ErrorCode.INTERNAL_ERROR,
    `Unexpected code path; expected exhaustive conditionals`,
    undefined,
    Severity.Error,
  );
}

export { EvmgenError as Error };
