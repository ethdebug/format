import type * as Format from "@ethdebug/format";
import type * as Ast from "#ast";

import { Value } from "./value.js";
import type { Type } from "./type.js";
import type { Instruction } from "./instruction.js";

/**
 * Basic block - sequence of instructions with single entry/exit
 */
export interface Block {
  /** Unique block ID */
  id: string;
  /** Phi nodes must be at the beginning of the block */
  phis: Block.Phi[];
  /** Instructions in execution order (after phi nodes) */
  instructions: Instruction[];
  /** Terminal instruction (jump, conditional jump, or return) */
  terminator: Block.Terminator;
  /** Predecessor block IDs (for CFG construction) */
  predecessors: Set<string>;
  /** Debug information (e.g., for if/while blocks) */
  debug: Block.Debug;
}

export namespace Block {
  /**
   * Debug information for blocks, terminators, and phi nodes
   */
  export interface Debug {
    context?: Format.Program.Context;
  }

  /**
   * Metadata for a jump that originated as a tail call.
   *
   * TCO replaces a call terminator with a jump to the
   * function's loop header. This metadata preserves the
   * logical "invoke" identity so codegen can emit an
   * invoke debug context on the JUMP, letting debuggers
   * still see the recursive call in the trace.
   */
  export interface TailCall {
    /** Name of the recursively-called function */
    function: string;
    /** Source location of the function declaration */
    declarationLoc?: Ast.SourceLocation;
    /** Source ID for the declaration (inherited from module) */
    declarationSourceId?: string;
  }

  /**
   * Block terminator instructions
   */
  export type Terminator =
    | {
        kind: "jump";
        target: string;
        operationDebug: Block.Debug;
        /** Set when this jump replaces a tail-recursive call */
        tailCall?: TailCall;
      }
    | {
        kind: "branch";
        condition: Value;
        conditionDebug?: Block.Debug;
        trueTarget: string;
        falseTarget: string;
        operationDebug: Block.Debug;
      }
    | {
        kind: "return";
        value?: Value;
        valueDebug?: Block.Debug;
        operationDebug: Block.Debug;
      }
    | {
        kind: "call";
        function: string;
        arguments: Value[];
        argumentsDebug?: Block.Debug[];
        dest?: string;
        continuation: string;
        operationDebug: Block.Debug;
      };

  export interface Phi {
    kind: "phi";
    /** Map from predecessor block ID to value */
    sources: Map<string, Value>;
    /** Map from predecessor block ID to debug context for that source */
    sourcesDebug?: Map<string, Block.Debug>;
    /** Destination temp to assign the phi result */
    dest: string;
    /** Type of the phi node (all sources must have same type) */
    type: Type;
    /** Debug context for the phi operation itself */
    operationDebug: Block.Debug;
  }
}
