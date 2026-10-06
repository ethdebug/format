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

    const operationDebug = yield* Process.Debug.forAstNode(expr);

    // Emit unary operation
    yield* Process.Instructions.emit({
      kind: "unary",
      op,
      operand: operandVal,
      dest: tempId,
      operationDebug,
    } as Ir.Instruction.UnaryOp);

    return op === "neg"
      ? yield* wrap(tempId, resultType, operationDebug)
      : Ir.Value.temp(tempId, resultType);
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

    const op = mapBinaryOp(expr.operator);
    const operationDebug = yield* Process.Debug.forAstNode(expr);

    // Emit binary operation
    yield* Process.Instructions.emit({
      kind: "binary",
      op,
      left: leftVal,
      right: rightVal,
      dest: tempId,
      operationDebug,
    } as Ir.Instruction.BinaryOp);

    return overflows(op, resultType)
      ? yield* wrap(tempId, resultType, operationDebug)
      : Ir.Value.temp(tempId, resultType);
  };

/**
 * Whether an operation's result can fall outside its type. A quotient
 * or remainder of unsigned values is no greater than the dividend, and
 * a signed remainder is smaller in magnitude than the divisor. A signed
 * quotient overflows only for the least value divided by -1.
 */
function overflows(op: Ir.Instruction.BinaryOp["op"], type: Ir.Type): boolean {
  switch (op) {
    case "add":
    case "sub":
    case "mul":
      return true;
    case "div":
      return Ir.Utils.isSigned(type);
    default:
      return false;
  }
}

/**
 * Wrap the result of arithmetic in temp `id`, computed in a full word,
 * to its type: keep the low bits of an unsigned result, and
 * sign-extend a signed one. This is the cast from a word to the type.
 * A 256-bit result needs no cast; the EVM wraps it already.
 */
function* wrap(
  id: string,
  type: Ir.Type,
  operationDebug: Ir.Instruction.Debug,
): Process<Ir.Value> {
  const word = Ir.Value.temp(id, Ir.Type.Scalar.word);
  if (Ir.Utils.castSteps(word.type, type).length === 0) {
    return Ir.Value.temp(id, type);
  }

  const dest = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "cast",
    value: word,
    targetType: type,
    dest,
    operationDebug,
  } as Ir.Instruction.Cast);

  return Ir.Value.temp(dest, type);
}

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
