import { Pointer } from "./pointer.js";
import { Machine } from "./machine.js";

export interface EvaluateOptions {
  expression: Pointer.Expression;
  machine: Machine;
  variables: {
    [identifier: string]: Machine.Data
  };
}

export const evaluate = ({
  expression,
  machine,
  variables = {}
}: EvaluateOptions): Machine.Data => {
  if (Pointer.Expression.isLiteral(expression)) {
    const literal = expression;
    switch (typeof literal) {
      case "string":
        return Machine.Data.fromHex(literal);
      case "number":
        return Machine.Data.fromNumber(literal);
    }
  }

  if (Pointer.Expression.isConstant(expression)) {
    const constant = expression;
    switch (constant) {
      case "$wordsize":
        return Machine.Data.fromHex("0x20");
    }
  }

  if (Pointer.Expression.isVariable(expression)) {
    const identifier = expression;

    return variables[identifier] || Machine.Word.zero();
  }

  if (Pointer.Expression.isArithmetic(expression)) {
    if (Pointer.Expression.Arithmetic.isSum(expression)) {
      const operands = expression.$sum.map(
        expression => evaluate({ expression, machine, variables }).asUint()
      );

      return Machine.Data.fromUint(
        operands.reduce((sum, data) => sum + data, 0n)
      );
    }

    if (Pointer.Expression.Arithmetic.isDifference(expression)) {
      const [a, b] = expression.$difference.map(
        expression => evaluate({ expression, machine, variables }).asUint()
      );

      return Machine.Data.fromUint(a - b);
    }

    if (Pointer.Expression.Arithmetic.isProduct(expression)) {
      const operands = expression.$product.map(
        expression => evaluate({ expression, machine, variables }).asUint()
      );

      return Machine.Data.fromUint(
        operands.reduce((product, data) => product * data, 1n)
      );
    }

    if (Pointer.Expression.Arithmetic.isQuotient(expression)) {
      const [a, b] = expression.$quotient.map(
        expression => evaluate({ expression, machine, variables }).asUint()
      );

      return Machine.Data.fromUint(a / b);
    }

    if (Pointer.Expression.Arithmetic.isRemainder(expression)) {
      const [a, b] = expression.$remainder.map(
        expression => evaluate({ expression, machine, variables }).asUint()
      );

      return Machine.Data.fromUint(a % b);
    }
  }

  throw new Error("not implemented");
}
