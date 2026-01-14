import { Pointer } from "@ethdebug/format";
import { Machine } from "#machine";
import { Data } from "#data";
import type { Cursor } from "#cursor";
import { read } from "#read";
import { keccak256 } from "ethereum-cryptography/keccak";

export interface EvaluateOptions {
  state: Machine.State;
  regions: {
    [identifier: string]: Cursor.Region;
  };
  variables: {
    [identifier: string]: Data;
  };
}

export async function evaluate(
  expression: Pointer.Expression,
  options: EvaluateOptions,
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

  if (Pointer.Expression.isConcat(expression)) {
    return evaluateConcat(expression, options);
  }

  if (Pointer.Expression.isResize(expression)) {
    return evaluateResize(expression, options);
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
    return evaluateRead(expression, options);
  }

  throw new Error(
    `Unexpected runtime failure to recognize kind of expression: ${JSON.stringify(
      expression,
    )}`,
  );
}

async function evaluateLiteral(
  literal: Pointer.Expression.Literal,
): Promise<Data> {
  switch (typeof literal) {
    case "string":
      return Data.fromHex(literal);
    case "number":
      return Data.fromNumber(literal);
  }
}

async function evaluateConstant(
  constant: Pointer.Expression.Constant,
): Promise<Data> {
  switch (constant) {
    case "$wordsize":
      return Data.fromHex("0x20");
  }
}

async function evaluateVariable(
  identifier: Pointer.Expression.Variable,
  { variables }: EvaluateOptions,
): Promise<Data> {
  const data = variables[identifier];
  if (typeof data === "undefined") {
    throw new Error(`Unknown variable with identifier ${identifier}`);
  }

  return data;
}

async function evaluateArithmeticSum(
  expression: Pointer.Expression.Arithmetic.Sum,
  options: EvaluateOptions,
): Promise<Data> {
  const operands = await Promise.all(
    expression.$sum.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const maxLength = operands.reduce(
    (max, { length }) => (length > max ? length : max),
    0,
  );

  const data = Data.fromUint(
    operands.reduce((sum, data) => sum + data.asUint(), 0n),
  ).padUntilAtLeast(maxLength);

  return data;
}

async function evaluateArithmeticDifference(
  expression: Pointer.Expression.Arithmetic.Difference,
  options: EvaluateOptions,
): Promise<Data> {
  const [a, b] = await Promise.all(
    expression.$difference.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const maxLength = a.length > b.length ? a.length : b.length;

  const unpadded =
    a.asUint() > b.asUint()
      ? Data.fromUint(a.asUint() - b.asUint())
      : Data.fromNumber(0);

  const data = unpadded.padUntilAtLeast(maxLength);
  return data;
}

async function evaluateArithmeticProduct(
  expression: Pointer.Expression.Arithmetic.Product,
  options: EvaluateOptions,
): Promise<Data> {
  const operands = await Promise.all(
    expression.$product.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const maxLength = operands.reduce(
    (max, { length }) => (length > max ? length : max),
    0,
  );

  return Data.fromUint(
    operands.reduce((product, data) => product * data.asUint(), 1n),
  ).padUntilAtLeast(maxLength);
}

async function evaluateArithmeticQuotient(
  expression: Pointer.Expression.Arithmetic.Quotient,
  options: EvaluateOptions,
): Promise<Data> {
  const [a, b] = await Promise.all(
    expression.$quotient.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const maxLength = a.length > b.length ? a.length : b.length;

  const data = Data.fromUint(a.asUint() / b.asUint()).padUntilAtLeast(
    maxLength,
  );

  return data;
}

async function evaluateArithmeticRemainder(
  expression: Pointer.Expression.Arithmetic.Remainder,
  options: EvaluateOptions,
): Promise<Data> {
  const [a, b] = await Promise.all(
    expression.$remainder.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const maxLength = a.length > b.length ? a.length : b.length;

  const data = Data.fromUint(a.asUint() % b.asUint()).padUntilAtLeast(
    maxLength,
  );

  return data;
}

async function evaluateKeccak256(
  expression: Pointer.Expression.Keccak256,
  options: EvaluateOptions,
): Promise<Data> {
  const operands = await Promise.all(
    expression.$keccak256.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  const preimage = Data.zero().concat(...operands);
  const hash = Data.fromBytes(keccak256(preimage));

  return hash;
}

async function evaluateConcat(
  expression: Pointer.Expression.Concat,
  options: EvaluateOptions,
): Promise<Data> {
  const operands = await Promise.all(
    expression.$concat.map(
      async (expression) => await evaluate(expression, options),
    ),
  );

  return Data.zero().concat(...operands);
}

async function evaluateResize(
  expression: Pointer.Expression.Resize,
  options: EvaluateOptions,
): Promise<Data> {
  const [[operation, subexpression]] = Object.entries(expression);

  const newLength = Pointer.Expression.Resize.isToNumber(expression)
    ? Number(operation.match(/^\$sized([1-9]+[0-9]*)$/)![1])
    : 32;

  return (await evaluate(subexpression, options)).resizeTo(newLength);
}

async function evaluateLookup<O extends Pointer.Expression.Lookup.Operation>(
  operation: O,
  lookup: Pointer.Expression.Lookup.ForOperation<O>,
  options: EvaluateOptions,
): Promise<Data> {
  const { regions } = options;

  const identifier = lookup[operation];
  const region = regions[identifier];
  if (!region) {
    throw new Error(`Region not found: ${identifier}`);
  }

  const property = Pointer.Expression.Lookup.propertyFrom(operation);

  const data = region[property as keyof typeof region] as Data | undefined;

  if (typeof data === "undefined") {
    throw new Error(
      `Region named ${identifier} does not have ${property} needed by lookup`,
    );
  }

  return data;
}

async function evaluateRead(
  expression: Pointer.Expression.Read,
  options: EvaluateOptions,
): Promise<Data> {
  const { state: _state, regions } = options;

  const identifier = expression.$read;
  const region = regions[identifier];
  if (!region) {
    throw new Error(`Region not found: ${identifier}`);
  }

  return await read(region, options);
}
