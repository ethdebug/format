/**
 * Block Layout Planning for EVM Code Generation
 *
 * Determines the order of basic blocks and their bytecode offsets
 * for jump target resolution.
 */

import type * as Ir from "#ir";
import { Result } from "#result";

import * as Memory from "./memory.js";

export namespace Module {
  /**
   * Module-level block layout information
   */
  export interface Info {
    create?: Function.Info;
    main: Function.Info;
    functions: {
      [functionName: string]: Function.Info;
    };
  }

  /**
   * Analyze block layout for entire module
   */
  export function perform(
    module: Ir.Module,
  ): Result<Module.Info, Memory.Error> {
    const result: Module.Info = {
      main: {} as Function.Info,
      functions: {},
    };

    // Process constructor if present
    if (module.create) {
      const createLayout = Function.perform(module.create);
      if (!createLayout.success) {
        return createLayout;
      }
      result.create = createLayout.value;
    }

    // Process main function
    const mainLayout = Function.perform(module.main);
    if (!mainLayout.success) {
      return mainLayout;
    }
    result.main = mainLayout.value;

    // Process user-defined functions
    for (const [name, func] of module.functions) {
      const funcLayout = Function.perform(func);
      if (!funcLayout.success) {
        return funcLayout;
      }
      result.functions[name] = funcLayout.value;
    }

    return Result.ok(result);
  }
}

export namespace Function {
  export interface Info {
    /** Order in which to generate blocks */
    order: string[];
    /** Bytecode offset for each block (filled during generation) */
    offsets: Map<string, number>;
  }

  /**
   * Layout blocks for a function
   *
   * Uses depth-first order to keep related blocks together,
   * minimizing jump distances.
   */
  export function perform(
    func: Ir.Function,
  ): Result<Function.Info, Memory.Error> {
    try {
      const visited = new Set<string>();
      const order = dfsOrder(func, func.entry, visited);

      // Add any unreachable blocks at the end
      const unreachable = Array.from(func.blocks.keys()).filter(
        (id) => !visited.has(id),
      );

      return Result.ok({
        order: [...order, ...unreachable],
        offsets: new Map(),
      });
    } catch (error) {
      return Result.err(
        new Memory.Error(
          Memory.ErrorCode.INVALID_LAYOUT,
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
    }
  }
}

/**
 * Perform depth-first traversal to order blocks
 */
function dfsOrder(
  func: Ir.Function,
  blockId: string,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(blockId)) return [];
  visited.add(blockId);

  const block = func.blocks.get(blockId);
  if (!block) return [];

  const term = block.terminator;

  if (term.kind === "jump") {
    return [blockId, ...dfsOrder(func, term.target, visited)];
  } else if (term.kind === "branch") {
    // Visit true branch first (arbitrary but consistent)
    const trueBranch = dfsOrder(func, term.trueTarget, visited);
    const falseBranch = dfsOrder(func, term.falseTarget, visited);
    return [blockId, ...trueBranch, ...falseBranch];
  } else {
    return [blockId];
  }
}

// Legacy exports for compatibility
export type BlockLayout = Function.Info;
export const layoutBlocks = (func: Ir.Function): Function.Info => {
  const result = Function.perform(func);
  if (!result.success) {
    throw new Error(
      Object.values(result.messages)[0]?.[0]?.message || "Layout failed",
    );
  }
  return result.value;
};
