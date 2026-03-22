import * as Ast from "#ast";
import { type Types, type Bindings, emptyBindings } from "#types";
import { Result } from "#result";
import { collectDeclarations } from "./declarations.js";
import { buildInitialSymbols } from "./symbols.js";
import { expressionChecker } from "./expressions.js";
import { statementChecker } from "./statements.js";
import { blockChecker } from "./blocks.js";
import { typeNodeChecker } from "./type-nodes.js";
import { Error as TypeError } from "./errors.js";
import type { Report, Context } from "./context.js";

/**
 * Compose the full type checker from modular parts
 */
const typeChecker: Ast.Visitor<Report, Context> = [
  expressionChecker,
  statementChecker,
  blockChecker,
  typeNodeChecker,
].reduce((a, b) => ({ ...a, ...b }), {}) as Ast.Visitor<Report, Context>;

/**
 * Main type checking function.
 *
 * Process:
 * 1. Collect all type declarations (structs, functions)
 * 2. Build initial symbol table with globals
 * 3. Traverse AST with composed visitor
 * 4. Return symbols and type map, or errors
 */
export function checkProgram(
  program: Ast.Program,
): Result<{ types: Types; bindings: Bindings }, TypeError> {
  // 1. Collect declarations (structs, functions)
  const declResult = collectDeclarations(program);
  if (!declResult.success) {
    return declResult;
  }

  // 2. Build initial symbol table with functions and storage
  const symbolResult = buildInitialSymbols(program, declResult.value);
  if (!symbolResult.success) {
    return symbolResult;
  }

  // 3. Type check with visitor traversal
  const context: Context = {
    symbols: symbolResult.value,
    structs: declResult.value.structs,
    nodeTypes: new Map(),
    bindings: emptyBindings(),
    visitor: typeChecker,
  };

  const report = Ast.visit(typeChecker, program, context);

  // 4. Return result
  if (report.errors.length > 0) {
    return Result.err([...report.errors]); // Convert readonly to mutable
  }

  return Result.ok({ types: report.nodeTypes, bindings: report.bindings });
}
