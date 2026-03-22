import type { Type } from "#types";

/**
 * Evaluation context for expressions
 * Tells the expression builder how the result will be used
 */
export type Context =
  | { kind: "rvalue" } // Normal evaluation - get the value
  | { kind: "lvalue-storage"; slot: number; type: Type } // Assigning to storage
  | { kind: "lvalue-memory"; type: Type }; // Assigning to memory variable

/**
 * Default context for most expression evaluations
 */
export const rvalue: Context = { kind: "rvalue" };
