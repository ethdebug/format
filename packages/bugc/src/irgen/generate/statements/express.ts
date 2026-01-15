import type * as Ast from "#ast";
import { type Process } from "../process.js";
import { buildExpression } from "../expressions/index.js";

/**
 * Build an expression statement
 */
export function* buildExpressionStatement(
  stmt: Ast.Statement.Express,
): Process<void> {
  yield* buildExpression(stmt.expression, { kind: "rvalue" });
}
