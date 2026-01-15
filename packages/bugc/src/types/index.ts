/**
 * Type system for the BUG language
 *
 * This module contains the core type definitions used throughout the compiler.
 * It is separate from the typechecker to allow other modules to use types
 * without depending on the checking logic.
 */

// Re-export all type definitions
export {
  Type,
  type Types,
  type Bindings,
  emptyBindings,
  recordBinding,
  mergeBindings,
} from "./spec.js";

// Export analysis tools
export * as Analysis from "./analysis/index.js";
