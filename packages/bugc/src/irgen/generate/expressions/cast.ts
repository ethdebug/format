import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Type } from "#types";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { Process } from "../process.js";
import { emitCopyToMemory, isCalldata } from "../calldata.js";
import type { Context } from "./context.js";

/**
 * Build a cast expression. Code generation turns the cast into code
 * by its source and target types (see `Ir.Utils.castSteps`).
 */
export const makeBuildCast = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) => {
  /**
   * Evaluate the expression being cast, typed as the type checker
   * typed it, so the cast knows its source type
   */
  function* buildOperand(
    operand: Ast.Expression,
    targetType: Ir.Type,
  ): Process<Ir.Value> {
    // `msg.data` is calldata at offset 0: cast its first 32 bytes
    if (
      Ast.Expression.Special.isMsgData(operand) &&
      Ir.Type.isScalar(targetType)
    ) {
      const type = fromBugType(Type.Elementary.bytes(32));
      const dest = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "calldata",
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        type,
        dest,
        operationDebug: yield* Process.Debug.forAstNode(operand),
      } as Ir.Instruction.Read);
      return Ir.Value.temp(dest, type);
    }

    const value = yield* buildExpression(operand, { kind: "rvalue" });
    const sourceType = yield* Process.Types.nodeType(operand);
    return sourceType ? { ...value, type: fromBugType(sourceType) } : value;
  }

  return function* buildCast(
    expr: Ast.Expression.Cast,
    _context: Context,
  ): Process<Ir.Value> {
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
      // Return the value being cast as it is
      return yield* buildExpression(expr.expression, { kind: "rvalue" });
    }

    const targetIrType = fromBugType(targetType);
    let value = yield* buildOperand(expr.expression, targetIrType);

    // A cast of bytes in calldata to a type in memory (`string`) copies
    // them there
    if (
      Ir.Type.isRef(targetIrType) &&
      targetIrType.location === "memory" &&
      isCalldata(value)
    ) {
      value = yield* emitCopyToMemory(value, expr, targetType);
    }
    const resultTemp = yield* Process.Variables.newTemp();

    yield* Process.Instructions.emit({
      kind: "cast",
      value,
      targetType: targetIrType,
      dest: resultTemp,
      operationDebug: yield* Process.Debug.forAstNode(expr),
    } as Ir.Instruction.Cast);

    return Ir.Value.temp(resultTemp, targetIrType);
  };
};
