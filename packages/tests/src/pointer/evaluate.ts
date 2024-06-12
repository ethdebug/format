import { Pointer } from "./pointer.js";
import { Machine } from "./machine.js";
import type { Cursor } from "./dereference.js";
import { Data } from "./data.js";
import { keccak256 } from "ethereum-cryptography/keccak";
import { toHex } from "ethereum-cryptography/utils";

export interface EvaluateOptions {
  machine: Machine;
  variables: {
    [identifier: string]: Data;
  };
  regions: {
    [identifier: string]: Pointer.Region;
  }
}

export async function evaluate(
  expression: Pointer.Expression,
  options: EvaluateOptions
): Promise<Data> {
  if (Pointer.Expression.isLiteral(expression)) {
    return evaluateLiteral(expression);
  }

  if (Pointer.Expression.isConstant(expression)) {
    return evaluateConstant(expression);
  }

  if (Pointer.Expression.isVariable(expression)) {
    return evaluateVariable(expression, options);
  }

  if (Pointer.Expression.isArithmetic(expression)) {
    if (Pointer.Expression.Arithmetic.isSum(expression)) {
      return evaluateArithmeticSum(expression, options);
    }

    if (Pointer.Expression.Arithmetic.isDifference(expression)) {
      return evaluateArithmeticDifference(expression, options);
    }

    if (Pointer.Expression.Arithmetic.isProduct(expression)) {
      return evaluateArithmeticProduct(expression, options);
    }

    if (Pointer.Expression.Arithmetic.isQuotient(expression)) {
      return evaluateArithmeticQuotient(expression, options);
    }

    if (Pointer.Expression.Arithmetic.isRemainder(expression)) {
      return evaluateArithmeticRemainder(expression, options);
    }
  }

  if (Pointer.Expression.isKeccak256(expression)) {
    return evaluateKeccak256(expression, options);
  }

  if (Pointer.Expression.isLookup(expression)) {
    if (Pointer.Expression.Lookup.isOffset(expression)) {
      return evaluateLookup(".offset", expression, options);
    }

    if (Pointer.Expression.Lookup.isLength(expression)) {
      return evaluateLookup(".length", expression, options);
    }

    if (Pointer.Expression.Lookup.isSlot(expression)) {
      return evaluateLookup(".slot", expression, options);
    }
  }

  if (Pointer.Expression.isRead(expression)) {
    // ...
  }

  throw new Error("not implemented");
}

async function evaluateLiteral(
  literal: Pointer.Expression.Literal
): Promise<Data> {
  switch (typeof literal) {
    case "string":
      return Data.fromHex(literal);
    case "number":
      return Data.fromNumber(literal);
  }
}

async function evaluateConstant(
  constant: Pointer.Expression.Constant
): Promise<Data> {
  switch (constant) {
    case "$wordsize":
      return Data.fromHex("0x20");
  }
}

async function evaluateVariable(
  identifier: Pointer.Expression.Variable,
  {
    variables
  }: EvaluateOptions
): Promise<Data> {
  return variables[identifier] || Data.Word.zero();
}

async function evaluateArithmeticSum(
  expression: Pointer.Expression.Arithmetic.Sum,
  options: EvaluateOptions
): Promise<Data> {
  const operands = await Promise.all(expression.$sum.map(
    async expression => (await evaluate(expression, options)).asUint()
  ));

  return Data.fromUint(
    operands.reduce((sum, data) => sum + data, 0n)
  );
}

async function evaluateArithmeticDifference(
  expression: Pointer.Expression.Arithmetic.Difference,
  options: EvaluateOptions
): Promise<Data> {
  const [a, b] = await Promise.all(expression.$difference.map(
    async expression => (await evaluate(expression, options)).asUint()
  ));

  return Data.fromUint(a - b);
}

async function evaluateArithmeticProduct(
  expression: Pointer.Expression.Arithmetic.Product,
  options: EvaluateOptions
): Promise<Data> {
  const operands = await Promise.all(expression.$product.map(
    async expression => (await evaluate(expression, options)).asUint()
  ));

  return Data.fromUint(
    operands.reduce((product, data) => product * data, 1n)
  );
}

async function evaluateArithmeticQuotient(
  expression: Pointer.Expression.Arithmetic.Quotient,
  options: EvaluateOptions
): Promise<Data> {
  const [a, b] = await Promise.all(expression.$quotient.map(
    async expression => (await evaluate(expression, options)).asUint()
  ));

  return Data.fromUint(a / b);
}

async function evaluateArithmeticRemainder(
  expression: Pointer.Expression.Arithmetic.Remainder,
  options: EvaluateOptions
): Promise<Data> {
  const [a, b] = await Promise.all(expression.$remainder.map(
    async expression => (await evaluate(expression, options)).asUint()
  ));

  return Data.fromUint(a % b);
}

async function evaluateKeccak256(
  expression: Pointer.Expression.Keccak256,
  options: EvaluateOptions
): Promise<Data> {
  const operands = await Promise.all(expression.$keccak256.map(
    async expression => await evaluate(expression, options)
  ));

  const concatenatedData = operands.reduce(
    (data, operand) => `${data}${toHex(operand).slice(2)}`,
    ""
  );

  const hash = keccak256(Buffer.from(concatenatedData, "hex"));

  return Data.fromBytes(hash);
}

async function evaluateLookup<O extends Pointer.Expression.Lookup.Operation>(
  operation: O,
  lookup: Pointer.Expression.Lookup.ForOperation<O>,
  options: EvaluateOptions
): Promise<Data> {
  const { regions } = options;

  const identifier = lookup[operation];
  const region = regions[identifier];
  if (!region) {
    throw new Error(`Region not found: ${identifier}`);
  }

  const property = Pointer.Expression.Lookup.propertyFrom(operation);
  const expression = region[property];
  if (typeof expression === "undefined") {
    throw new Error(
      `Region named ${identifier} does not have ${property} needed by lookup`
    );
  }

  return await evaluate(expression, options);
}
