import type * as Ast from "#ast";
import * as Ir from "#ir";

import { assertExhausted } from "#irgen/errors";
import { type Process } from "../process.js";
import type { Context } from "./context.js";

import { buildIdentifier } from "./identifier.js";
import { buildLiteral } from "./literal.js";
import { makeBuildOperator } from "./operator.js";
import { makeBuildAccess } from "./access.js";
import { makeBuildCall } from "./call.js";
import { makeBuildCast } from "./cast.js";
import { buildSpecial } from "./special.js";
import { buildArray } from "./array.js";

const buildOperator = makeBuildOperator(buildExpression);
const buildAccess = makeBuildAccess(buildExpression);
const buildCall = makeBuildCall(buildExpression);
const buildCast = makeBuildCast(buildExpression);

/**
 * Build an expression and return the resulting IR value
 */
export function* buildExpression(
  expr: Ast.Expression,
  context: Context,
): Process<Ir.Value> {
  switch (expr.kind) {
    case "expression:identifier":
      return yield* buildIdentifier(expr as Ast.Expression.Identifier);
    case "expression:literal:number":
    case "expression:literal:string":
    case "expression:literal:boolean":
    case "expression:literal:address":
    case "expression:literal:hex":
      return yield* buildLiteral(expr as Ast.Expression.Literal);
    case "expression:operator":
      return yield* buildOperator(expr as Ast.Expression.Operator, context);
    case "expression:access:member":
    case "expression:access:slice":
    case "expression:access:index":
      return yield* buildAccess(expr as Ast.Expression.Access, context);
    case "expression:call":
      return yield* buildCall(expr as Ast.Expression.Call, context);
    case "expression:cast":
      return yield* buildCast(expr as Ast.Expression.Cast, context);
    case "expression:special:msg.sender":
    case "expression:special:msg.value":
    case "expression:special:msg.data":
    case "expression:special:block.timestamp":
    case "expression:special:block.number":
      return yield* buildSpecial(expr as Ast.Expression.Special);
    case "expression:array":
      return yield* buildArray(expr as Ast.Expression.Array, context);
    case "expression:struct":
      // TODO: Implement struct expression generation
      throw new Error(
        "Struct expressions not yet implemented in IR generation",
      );
    default:
      assertExhausted(expr);
  }
}
