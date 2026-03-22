import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { Process } from "../process.js";
import type { Context } from "./context.js";

/**
 * Build a cast expression
 */
export const makeBuildCast = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) =>
  function* buildCast(
    expr: Ast.Expression.Cast,
    _context: Context,
  ): Process<Ir.Value> {
    // Evaluate the expression being cast
    const exprValue = yield* buildExpression(expr.expression, {
      kind: "rvalue",
    });

    // Get the target type from the type checker
    const targetType = yield* Process.Types.nodeType(expr);

    if (!targetType) {
      yield* Process.Errors.report(
        new IrgenError(
          "Cannot determine target type for cast expression",
          expr.loc ?? undefined,
          Severity.Error,
        ),
      );
      return exprValue; // Return the original value
    }

    const targetIrType = fromBugType(targetType);

    // For now, we'll generate a cast instruction that will be handled during bytecode generation
    // In many cases, the cast is a no-op at the IR level (e.g., uint256 to address)
    const resultTemp = yield* Process.Variables.newTemp();

    yield* Process.Instructions.emit({
      kind: "cast",
      value: exprValue,
      targetType: targetIrType,
      dest: resultTemp,
      operationDebug: yield* Process.Debug.forAstNode(expr),
    } as Ir.Instruction.Cast);

    return Ir.Value.temp(resultTemp, targetIrType);
  };
