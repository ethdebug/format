export const VERSION = "0.1.0";

export * as Ast from "#ast";
export * as Ir from "#ir";
export * as Evm from "#evm";
export * as Parser from "#parser";

// Re-export type checker functionality
export * as TypeChecker from "#typechecker";

// Re-export type system
export { Type } from "#types";

// Re-export IR generation functionality
export { generateModule } from "#irgen";

// Re-export optimizer functionality
export { optimizeIr } from "#optimizer";
export type { OptimizationLevel } from "#optimizer";

// Re-export error handling utilities
export * from "#errors";

// Re-export result type
export * from "#result";

// Re-export compiler interfaces
export { compile, type CompileOptions } from "#compiler";

// CLI utilities are not exported to avoid browser compatibility issues
// They should be imported directly from ./cli when needed in Node.js environments
