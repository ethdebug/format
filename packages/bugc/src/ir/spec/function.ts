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
  /** Source location of the function declaration */
  loc?: Ast.SourceLocation;
  /** Source ID for debug info (inherited from module) */
  sourceId?: string;
  /**
   * Dominator trees from before optimization, by function name (this
   * function's, and those of functions inlined into it). Instruction
   * and version `origin`s refer to these.
   */
  origins?: Map<string, Record<string, string | null>>;
}

export namespace Function {
  /**
   * A position in a function as it was before optimization: a block
   * and an instruction index (`-1`: block entry, i.e. a parameter or
   * phi; the instruction count: the terminator).
   */
  export interface Origin {
    function: string;
    block: string;
    index: number;
  }

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
    /**
     * Source offset at which the variable's enclosing lexical scope
     * ends. Together with `loc`, gives the lexical extent over which
     * the variable is in scope: `[loc.offset, scopeEnd)`. Used to
     * list a variable (name + type) across its scope, independently
     * of whether its value is currently located.
     */
    scopeEnd?: number;
    /**
     * The source range (`offset:end`) of the scope that declares the
     * variable; undefined for a function-level name (a parameter).
     * With `name` (and `inlineSite`), it tells declarations apart.
     */
    declaredIn?: string;
    /**
     * Where the version is defined, if not where its temp is: a
     * version that aliases a temp computed earlier is defined at the
     * assignment, between instructions (a fractional index).
     */
    defined?: { block: string; index: number };
    /**
     * Where the version was defined before optimization (see
     * `Function.origins`), if it was defined.
     */
    origin?: Function.Origin;
    /**
     * The temp that holds this variable's value, where it is not the
     * temp this entry is keyed by (e.g. an inlined parameter, whose
     * value is the call's argument).
     */
    temp?: string;
    /**
     * A version whose temp the function never defines (a declaration's
     * own version, replaced by its initializer's temp). It carries the
     * declaration's location and scope only.
     */
    placeholder?: boolean;
    /**
     * For a variable of an inlined callee, the inline site it belongs
     * to (see `Instruction.Debug.inlineSites`).
     */
    inlineSite?: string;
  }
}
