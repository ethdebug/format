import * as Ast from "#ast";

/**
 * Whether control can never run past the end of a block: every path
 * through it reaches a `return`.
 *
 * - A `return` ends the path.
 * - An `if` ends every path only when it has an `else` and both
 *   branches end every path.
 * - A loop never counts: BUG has no loop form that is provably
 *   infinite, so a loop may always exit and fall through.
 */
export function alwaysReturns(block: Ast.Block): boolean {
  if (block.kind !== "block:statements") {
    return false;
  }
  return block.items.some(statementAlwaysReturns);
}

function statementAlwaysReturns(statement: Ast.Statement): boolean {
  switch (statement.kind) {
    case "statement:control-flow:return":
      return true;
    case "statement:control-flow:if":
      return (
        statement.alternate !== undefined &&
        alwaysReturns(statement.body) &&
        alwaysReturns(statement.alternate)
      );
    default:
      return false;
  }
}
