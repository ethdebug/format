import type * as Ir from "#ir";
import { optimizeIr } from "./simple-optimizer.js";
import { type OptimizationLevel } from "./optimizer.js";
import { Result } from "#result";
import type { Pass } from "#compiler";

/**
 * Optimization pass - optimizes intermediate representation
 */
export const pass: Pass<{
  needs: {
    ir: Ir.Module;
    optimizer?: {
      level?: OptimizationLevel;
    };
  };
  adds: {
    ir: Ir.Module;
  };
  error: never;
}> = {
  async run({ ir, optimizer: { level = 0 } = {} }) {
    return Result.ok({
      ir: optimizeIr(ir, level),
    });
  },
};
