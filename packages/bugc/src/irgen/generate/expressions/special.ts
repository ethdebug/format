import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError, assertExhausted } from "#irgen/errors";
import { fromBugType } from "#irgen/type";
import { Process } from "../process.js";
import { emitLength } from "../memory.js";
import { calldataType } from "../calldata.js";

/**
 * The `msg_data` env value, whose `length` code generation reads as
 * the calldata size
 */
export function* buildMsgDataEnv(
  msgData: Ast.Expression.Special,
): Process<Ir.Value> {
  const temp = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "env",
    op: "msg_data",
    dest: temp,
    operationDebug: yield* Process.Debug.forAstNode(msgData),
  } as Ir.Instruction.Env);
  return Ir.Value.temp(temp, calldataType());
}

/**
 * Build a special expression (msg.sender, block.number, etc.)
 */
export function* buildSpecial(expr: Ast.Expression.Special): Process<Ir.Value> {
  // msg.data refers to all of the calldata: offset 0, so its word is
  // its length (see `calldata.ts`)
  if (expr.kind === "expression:special:msg.data") {
    const size = yield* emitLength(yield* buildMsgDataEnv(expr), expr);
    return { ...size, type: calldataType() };
  }

  // Get the type from the type checker
  const nodeType = yield* Process.Types.nodeType(expr);

  if (!nodeType) {
    yield* Process.Errors.report(
      new IrgenError(
        `Cannot determine type for special expression: ${expr.kind}`,
        expr.loc ?? undefined,
        Severity.Error,
      ),
    );
    // Return a default value to allow compilation to continue
    return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
  }

  const resultType = fromBugType(nodeType);
  const temp = yield* Process.Variables.newTemp();

  let op: Ir.Instruction.Env["op"];
  switch (expr.kind) {
    case "expression:special:msg.sender":
      op = "msg_sender";
      break;
    case "expression:special:msg.value":
      op = "msg_value";
      break;
    case "expression:special:block.timestamp":
      op = "block_timestamp";
      break;
    case "expression:special:block.number":
      op = "block_number";
      break;
    case "expression:special:block.prevrandao":
      op = "block_prevrandao";
      break;
    default:
      assertExhausted(expr);
  }

  yield* Process.Instructions.emit({
    kind: "env",
    op,
    dest: temp,
    operationDebug: yield* Process.Debug.forAstNode(expr),
  } as Ir.Instruction.Env);

  return Ir.Value.temp(temp, resultType);
}
