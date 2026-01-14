import type { Type } from "./type.js";
import type * as Format from "@ethdebug/format";

/**
 * Debug context for values (operands)
 */
export interface ValueDebug {
  context?: Format.Program.Context;
}

/**
 * Ir value - either a constant or a reference to a temporary
 *
 * Each value can now carry its own debug context to track where the value
 * originated in the source code. This enables sub-instruction level debug
 * tracking for optimizer passes.
 */
export type Value =
  | {
      kind: "const";
      value: bigint | string | boolean;
      type: Type;
      debug?: ValueDebug;
    }
  | { kind: "temp"; id: string; type: Type; debug?: ValueDebug };

export namespace Value {
  /**
   * Helper to create temporary value references
   */
  export function temp(id: string, type: Type, debug?: ValueDebug): Value {
    return { kind: "temp", id, type, debug };
  }

  /**
   * Helper to create constant values
   */
  export function constant(
    value: bigint | string | boolean,
    type: Type,
    debug?: ValueDebug,
  ): Value {
    return { kind: "const", value, type, debug };
  }
}
