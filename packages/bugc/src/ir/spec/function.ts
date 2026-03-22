import type * as Ast from "#ast";

import type { Type } from "./type.js";
import type { Block } from "./block.js";

/**
 * Ir function containing basic blocks
 */
export interface Function {
  /** Function name (for debugging) */
  name: string;
  /** Function parameters as temps (in SSA form) */
  parameters: Function.Parameter[];
  /** Entry block ID */
  entry: string;
  /** All basic blocks in the function */
  blocks: Map<string, Block>;
  /** SSA variable metadata mapping temp IDs to original variables */
  ssaVariables?: Map<string, Function.SsaVariable>;
}

export namespace Function {
  /**
   * Function parameter in SSA form
   */
  export interface Parameter {
    /** Parameter name (for debugging) */
    name: string;
    /** Parameter type */
    type: Type;
    /** Temp ID for this parameter */
    tempId: string;
    /** Source location of declaration */
    loc?: Ast.SourceLocation;
  }

  /**
   * SSA variable metadata
   */
  export interface SsaVariable {
    /** Original variable name */
    name: string;
    /** Scope identifier (to handle shadowing) */
    scopeId: string;
    /** Type of the variable */
    type: Type;
    /** Version number for this SSA instance */
    version: number;
    /** Source location of declaration */
    loc?: Ast.SourceLocation;
  }
}
