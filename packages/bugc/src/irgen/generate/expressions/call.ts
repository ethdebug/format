import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Type } from "#types";

import { Error as IrgenError } from "#irgen/errors";
import { Process } from "../process.js";
import type { Context } from "./context.js";
import { fromBugType } from "#irgen/type";
import {
  type StorageAccessChain,
  findStorageAccessChain,
  emitStorageChainLoad,
  emitStorageChainStore,
} from "../storage.js";
import { emitInMemory } from "../calldata.js";

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
    // `a.push(v)` or `a.push()` on a dynamic array in storage
    if (
      Ast.Expression.isAccess(expr.callee) &&
      Ast.Expression.Access.isMember(expr.callee) &&
      expr.callee.property === "push"
    ) {
      return yield* buildPush(expr, expr.callee, buildExpression);
    }

    // Check if this is a built-in function call
    if (
      expr.callee.kind === "expression:identifier" &&
      (expr.callee as Ast.Expression.Identifier).name === "keccak256"
    ) {
      // keccak256 built-in function
      if (expr.arguments.length === 0) {
        yield* Process.Errors.report(
          new IrgenError(
            "keccak256 expects at least 1 argument",
            expr.loc ?? undefined,
            Severity.Error,
          ),
        );
        return Ir.Value.constant(0n, Ir.Type.Scalar.bytes32);
      }

      // Evaluate the arguments, in order (in memory: the hash reads
      // memory)
      const values: Ir.Value[] = [];
      for (const argument of expr.arguments) {
        values.push(
          yield* emitInMemory(
            yield* buildExpression(argument, { kind: "rvalue" }),
            argument,
          ),
        );
      }

      // Generate hash instruction
      const resultType: Ir.Type = Ir.Type.Scalar.bytes32;
      const resultTemp = yield* Process.Variables.newTemp();

      yield* Process.Instructions.emit({
        kind: "hash",
        values,
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

      // Evaluate arguments; a parameter's bytes are in memory
      const argValues: Ir.Value[] = [];
      for (const arg of expr.arguments) {
        argValues.push(
          yield* emitInMemory(
            yield* buildExpression(arg, { kind: "rvalue" }),
            arg,
          ),
        );
      }

      // A void function's call has the type checker's "void
      // function" failure as its type, which has no IR type: only a
      // call with a result gets a destination
      const isVoidFunction =
        Type.isFailure(callType) && callType.reason === "void function";
      const irType = isVoidFunction ? undefined : fromBugType(callType);
      const dest = irType ? yield* Process.Variables.newTemp() : undefined;

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
      if (dest && irType) {
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

/**
 * Push onto a dynamic array in storage, as Solidity does: write the
 * value (if any) at index `length`, then store `length + 1`. With no
 * value, the new element is zero: nothing can have written past the
 * length.
 */
function* buildPush(
  expr: Ast.Expression.Call,
  callee: Ast.Expression.Access.Member,
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
): Process<Ir.Value> {
  const marker = Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
  const value =
    expr.arguments.length > 0
      ? yield* buildExpression(expr.arguments[0], { kind: "rvalue" })
      : undefined;

  const chain = yield* findStorageAccessChain(callee.object);
  if (!chain) {
    yield* Process.Errors.report(
      new IrgenError(
        "push needs a dynamic array in storage",
        expr.loc ?? undefined,
        Severity.Error,
      ),
    );
    return marker;
  }
  // Each use of the chain gets its own copy of its accesses
  const copy = (
    extra: StorageAccessChain["accesses"] = [],
  ): StorageAccessChain => ({
    slot: chain.slot,
    accesses: [...chain.accesses.map((access) => ({ ...access })), ...extra],
  });

  const length = yield* emitStorageChainLoad(
    copy(),
    Ir.Type.Scalar.uint256,
    expr,
  );
  if (value) {
    yield* emitStorageChainStore(
      copy([{ kind: "index", key: length, unchecked: true }]),
      value,
      expr,
    );
  }

  const next = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op: "add",
    left: length,
    right: Ir.Value.constant(1n, Ir.Type.Scalar.uint256),
    dest: next,
    operationDebug: yield* Process.Debug.forAstNode(expr),
  } as Ir.Instruction.BinaryOp);
  yield* emitStorageChainStore(
    copy(),
    Ir.Value.temp(next, Ir.Type.Scalar.uint256),
    expr,
  );

  return marker;
}
