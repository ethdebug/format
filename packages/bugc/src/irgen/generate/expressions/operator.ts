import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError, assertExhausted } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { Process } from "../process.js";
import type { Context } from "./context.js";

/**
 * Build an operator expression (unary or binary)
 */
export const makeBuildOperator = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) => {
  const buildUnaryOperator = makeBuildUnaryOperator(buildExpression);
  const buildBinaryOperator = makeBuildBinaryOperator(buildExpression);

  return function* buildOperator(
    expr: Ast.Expression.Operator,
    context: Context,
  ): Process<Ir.Value> {
    // Get the type from the context
    const nodeType = yield* Process.Types.nodeType(expr);

    if (!nodeType) {
      yield* Process.Errors.report(
        new IrgenError(
          `Cannot determine type for operator expression: ${expr.operator}`,
          expr.loc ?? undefined,
          Severity.Error,
        ),
      );
      return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
    }

    switch (expr.operands.length) {
      case 1:
        return yield* buildUnaryOperator(expr, context);
      case 2:
        return yield* buildBinaryOperator(
          expr as typeof expr & { operands: { length: 2 } },
          context,
        );
      default:
        assertExhausted(expr.operands);
    }
  };
};
/**
 * Build a unary operator expression
 */
const makeBuildUnaryOperator = (
  buildExpression: (
    expr: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) =>
  function* buildUnaryOperator(
    expr: Ast.Expression.Operator,
    _context: Context,
  ): Process<Ir.Value> {
    // Get the result type from the context
    const nodeType = yield* Process.Types.nodeType(expr);

    if (!nodeType) {
      yield* Process.Errors.report(
        new IrgenError(
          `Cannot determine type for unary operator: ${expr.operator}`,
          expr.loc ?? undefined,
          Severity.Error,
        ),
      );
      return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
    }

    const resultType = fromBugType(nodeType);

    // Evaluate operand
    const operandVal = yield* buildExpression(expr.operands[0], {
      kind: "rvalue",
    });

    // Generate temp for result
    const tempId = yield* Process.Variables.newTemp();

    // Map operator (matching generator.ts logic)
    const op = expr.operator === "!" ? "not" : "neg";

    // Emit unary operation
    yield* Process.Instructions.emit({
      kind: "unary",
      op,
      operand: operandVal,
      dest: tempId,
      operationDebug: yield* Process.Debug.forAstNode(expr),
    } as Ir.Instruction.UnaryOp);

    return Ir.Value.temp(tempId, resultType);
  };

/**
 * Build a binary operator expression
 */
const makeBuildBinaryOperator = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) =>
  function* buildBinaryOperator(
    expr: Ast.Expression.Operator & { operands: { length: 2 } },
    _context: Context,
  ): Process<Ir.Value> {
    // Get the result type from the context
    const nodeType = yield* Process.Types.nodeType(expr);

    if (!nodeType) {
      yield* Process.Errors.report(
        new IrgenError(
          `Cannot determine type for binary operator: ${expr.operator}`,
          expr.loc ?? undefined,
          Severity.Error,
        ),
      );
      return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
    }

    const resultType = fromBugType(nodeType);

    // Evaluate operands
    const leftVal = yield* buildExpression(expr.operands[0], {
      kind: "rvalue",
    });
    const rightVal = yield* buildExpression(expr.operands[1], {
      kind: "rvalue",
    });

    // Generate temp for result
    const tempId = yield* Process.Variables.newTemp();

    // Emit binary operation
    yield* Process.Instructions.emit({
      kind: "binary",
      op: mapBinaryOp(expr.operator),
      left: leftVal,
      right: rightVal,
      dest: tempId,
      operationDebug: yield* Process.Debug.forAstNode(expr),
    } as Ir.Instruction.BinaryOp);

    return Ir.Value.temp(tempId, resultType);
  };

function mapBinaryOp(op: string): Ir.Instruction.BinaryOp["op"] {
  const opMap: Record<string, Ir.Instruction.BinaryOp["op"]> = {
    "+": "add",
    "-": "sub",
    "*": "mul",
    "/": "div",
    "%": "mod",
    "==": "eq",
    "!=": "ne",
    "<": "lt",
    "<=": "le",
    ">": "gt",
    ">=": "ge",
    "&&": "and",
    "||": "or",
  };
  return opMap[op] || "add";
}
