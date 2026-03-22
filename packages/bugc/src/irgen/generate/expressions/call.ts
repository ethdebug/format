import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Type } from "#types";

import { Error as IrgenError } from "#irgen/errors";
import { Process } from "../process.js";
import type { Context } from "./context.js";
import { fromBugType } from "#irgen/type";

/**
 * Build a call expression
 */
export const makeBuildCall = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) =>
  function* buildCall(
    expr: Ast.Expression.Call,
    _context: Context,
  ): Process<Ir.Value> {
    // Check if this is a built-in function call
    if (
      expr.callee.kind === "expression:identifier" &&
      (expr.callee as Ast.Expression.Identifier).name === "keccak256"
    ) {
      // keccak256 built-in function
      if (expr.arguments.length !== 1) {
        yield* Process.Errors.report(
          new IrgenError(
            "keccak256 expects exactly 1 argument",
            expr.loc ?? undefined,
            Severity.Error,
          ),
        );
        return Ir.Value.constant(0n, Ir.Type.Scalar.bytes32);
      }

      // Evaluate the argument
      const argValue = yield* buildExpression(expr.arguments[0], {
        kind: "rvalue",
      });

      // Generate hash instruction
      const resultType: Ir.Type = Ir.Type.Scalar.bytes32;
      const resultTemp = yield* Process.Variables.newTemp();

      yield* Process.Instructions.emit({
        kind: "hash",
        value: argValue,
        dest: resultTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);

      return Ir.Value.temp(resultTemp, resultType);
    }

    // Handle user-defined function calls
    if (expr.callee.kind === "expression:identifier") {
      const functionName = (expr.callee as Ast.Expression.Identifier).name;

      // Get the function type from the type checker
      const callType = yield* Process.Types.nodeType(expr);

      if (!callType) {
        yield* Process.Errors.report(
          new IrgenError(
            `Unknown function: ${functionName}`,
            expr.loc ?? undefined,
            Severity.Error,
          ),
        );
        return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
      }

      // Evaluate arguments
      const argValues: Ir.Value[] = [];
      for (const arg of expr.arguments) {
        argValues.push(yield* buildExpression(arg, { kind: "rvalue" }));
      }

      // Generate call terminator and split block
      const irType = fromBugType(callType);
      let dest: string | undefined;

      // Only create a destination if the function returns a value
      // Check if it's a void function by checking if the type is a failure with "void function" message
      const isVoidFunction =
        Type.isFailure(callType) &&
        (callType as Type.Failure).reason === "void function";

      if (!isVoidFunction) {
        dest = yield* Process.Variables.newTemp();
      }

      // Create a continuation block for after the call
      const continuationBlockId = yield* Process.Blocks.create("call_cont");

      // Terminate current block with call terminator
      yield* Process.Blocks.terminate({
        kind: "call",
        function: functionName,
        arguments: argValues,
        dest,
        continuation: continuationBlockId,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      });

      // Switch to the continuation block
      yield* Process.Blocks.switchTo(continuationBlockId);

      // Return the result value or a dummy value for void functions
      if (dest) {
        return Ir.Value.temp(dest, irType);
      }
      // Void function - return a dummy value
      return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
    }

    // Other forms of function calls not supported
    yield* Process.Errors.report(
      new IrgenError(
        "Complex function call expressions not yet supported",
        expr.loc ?? undefined,
        Severity.Error,
      ),
    );
    return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
  };
