/**
 * Compiler pass system for composing compilation passes
 */

// Re-export everything from submodules
export type { Pass } from "./pass.js";
export * from "./sequence.js";
export * from "./sequences/index.js";

// Export new compile interface
export { compile, type CompileOptions } from "./compile.js";
