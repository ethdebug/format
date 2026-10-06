import * as Ast from "#ast";
import { Type } from "#types";

/**
 * An integer literal operand: a number literal, or `-` applied to one.
 * `nodes` are the expression's nodes that take the literal's type.
 */
export interface IntegerLiteral {
  value: bigint;
  nodes: Ast.Expression[];
}

export function integerLiteral(
  node: Ast.Expression,
): IntegerLiteral | undefined {
  if (
    Ast.Expression.isLiteral(node) &&
    node.kind === "expression:literal:number" &&
    !node.unit
  ) {
    return { value: BigInt(node.value), nodes: [node] };
  }

  if (
    Ast.Expression.isOperator(node) &&
    node.operator === "-" &&
    node.operands.length === 1
  ) {
    const operand = integerLiteral(node.operands[0]);
    return (
      operand && { value: -operand.value, nodes: [node, ...operand.nodes] }
    );
  }

  return undefined;
}

/**
 * Whether a type is an integer type, signed or unsigned
 */
export function isInteger(type: Type): type is Type.Elementary {
  return Type.isElementary(type) && Type.Elementary.isNumeric(type);
}

/**
 * Whether an integer type holds a value
 */
export function fits(value: bigint, type: Type.Elementary): boolean {
  const bits = BigInt((type as { bits?: number }).bits ?? 256);
  return Type.Elementary.isInt(type)
    ? value >= -(1n << (bits - 1n)) && value < 1n << (bits - 1n)
    : value >= 0n && value < 1n << bits;
}
