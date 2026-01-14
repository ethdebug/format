import type * as Ast from "#ast";
import type * as Format from "@ethdebug/format";

import type { Function as IrFunction } from "./function.js";

/**
 * Top-level Ir module representing a complete BUG program
 */
export interface Module {
  /** Program name from 'name' declaration */
  name: string;
  /** User-defined functions */
  functions: Map<string, IrFunction>;
  /** Constructor function (optional, for contract creation) */
  create?: IrFunction;
  /** The main code function (runtime code) */
  main: IrFunction;
  /** Source location of the program */
  loc?: Ast.SourceLocation;
  /** Program-level debug context (storage variables, etc.) */
  debugContext?: Format.Program.Context;
}
