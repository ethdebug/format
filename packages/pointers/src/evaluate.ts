import { Pointer } from "@ethdebug/format";
import type { Machine } from "#machine";
import { Data } from "#data";
import type { Cursor } from "#cursor";
import { read } from "#read";
import { keccak256 } from "ethereum-cryptography/keccak";

/**
 * The result of evaluating an expression: one of two sorts of value.
 *
 * An **integer** is an unbounded non-negative integer with no width; it
 * is produced by JSON-number literals, `$wordsize`, lookups, arithmetic,
 * and odd-digit hex literals.
 *
 * **Bytes** are a byte sequence with a definite width; they are produced
 * by even-digit hex literals, `$read`, and the resize forms.
 *
 * Variables carry the sort of the expression that defined them.
 */
export type Value = Value.Integer | Value.Bytes;

export namespace Value {
  export interface Integer {
    sort: "integer";
    value: bigint;
  }

  export interface Bytes {
    sort: "bytes";
    data: Data;
  }

  export const integer = (value: bigint): Integer => ({
    sort: "integer",
    value,
  });

  export const bytes = (data: Data): Bytes => ({ sort: "bytes", data });

  export const isInteger = (value: Value): value is Integer =>
    value.sort === "integer";

  export const isBytes = (value: Value): value is Bytes =>
    value.sort === "bytes";

  /**
   * Coerce to an integer, for positions where an integer is expected
   * (arithmetic operands, list counts, segment slot/offset/length). Bytes
   * are read as the non-negative integer they encode big-endian.
   */
  export const toInteger = (value: Value): bigint =>
    isInteger(value) ? value.value : value.data.asUint();

  /**
   * Represent as `Data` for storage on a concrete `Cursor.Region`. Bytes
   * keep their width; an integer is encoded as its minimal big-endian
   * bytes (a region's slot/offset/length are integers, so this width is
   * not significant).
   */
  export const toData = (value: Value): Data =>
    isBytes(value) ? value.data : Data.fromUint(value.value);
}

export interface EvaluateOptions {
  state: Machine.State;
  regions: {
    [identifier: string]: Cursor.Region;
  };
  variables: {
    [identifier: string]: Value;
  };
}

export async function evaluate(
  expression: Pointer.Expression,
  options: EvaluateOptions,
): Promise<Value> {
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
    return evaluateArithmetic(expression, options);
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

/**
 * Evaluate an expression where an integer is expected, coercing bytes
 */
async function evaluateInteger(
  expression: Pointer.Expression,
  options: EvaluateOptions,
): Promise<bigint> {
  return Value.toInteger(await evaluate(expression, options));
}

/**
 * Evaluate the operands of a width-sensitive operation (`$concat`,
 * `$keccak256`), each of which must evaluate to bytes
 */
async function evaluateBytesOperands(
  operation: "$concat" | "$keccak256",
  operands: Pointer.Expression[],
  options: EvaluateOptions,
): Promise<Data[]> {
  return await Promise.all(
    operands.map(async (operand, index) => {
      const value = await evaluate(operand, options);

      if (Value.isInteger(value)) {
        throw new Error(
          [
            `Operand ${index} of ${operation} (${JSON.stringify(operand)}) `,
            `evaluates to the integer ${value.value}, which has no byte `,
            `width; give it a width with $wordsized or $sizedN`,
          ].join(""),
        );
      }

      return value.data;
    }),
  );
}

async function evaluateLiteral(
  literal: Pointer.Expression.Literal,
): Promise<Value> {
  switch (typeof literal) {
    case "string": {
      const digits = literal.slice(2);

      // an odd number of digits has no whole-byte width
      if (digits.length % 2 === 1) {
        return Value.integer(BigInt(literal));
      }

      return Value.bytes(Data.fromHex(literal));
    }
    case "number":
      return Value.integer(BigInt(literal));
  }
}

async function evaluateConstant(
  constant: Pointer.Expression.Constant,
): Promise<Value> {
  switch (constant) {
    case "$wordsize":
      return Value.integer(32n);
  }
}

async function evaluateVariable(
  identifier: Pointer.Expression.Variable,
  { variables }: EvaluateOptions,
): Promise<Value> {
  const value = variables[identifier];
  if (typeof value === "undefined") {
    throw new Error(`Unknown variable with identifier ${identifier}`);
  }

  return value;
}

async function evaluateArithmetic(
  expression: Pointer.Expression.Arithmetic,
  options: EvaluateOptions,
): Promise<Value> {
  const [[operation, operandExpressions]] = Object.entries(expression) as [
    string,
    Pointer.Expression[],
  ][];

  const operands = await Promise.all(
    operandExpressions.map((operand) => evaluateInteger(operand, options)),
  );

  switch (operation) {
    case "$sum":
      return Value.integer(operands.reduce((sum, value) => sum + value, 0n));
    case "$difference": {
      const [a, b] = operands;
      return Value.integer(a > b ? a - b : 0n);
    }
    case "$product":
      return Value.integer(
        operands.reduce((product, value) => product * value, 1n),
      );
    case "$quotient": {
      const [a, b] = operands;
      return Value.integer(a / b);
    }
    case "$remainder": {
      const [a, b] = operands;
      return Value.integer(a % b);
    }
  }

  throw new Error(`Unknown arithmetic operation ${operation}`);
}

async function evaluateKeccak256(
  expression: Pointer.Expression.Keccak256,
  options: EvaluateOptions,
): Promise<Value> {
  const operands = await evaluateBytesOperands(
    "$keccak256",
    expression.$keccak256,
    options,
  );

  const preimage = Data.zero().concat(...operands);

  return Value.bytes(Data.fromBytes(keccak256(preimage)));
}

async function evaluateConcat(
  expression: Pointer.Expression.Concat,
  options: EvaluateOptions,
): Promise<Value> {
  const operands = await evaluateBytesOperands(
    "$concat",
    expression.$concat,
    options,
  );

  return Value.bytes(Data.zero().concat(...operands));
}

async function evaluateResize(
  expression: Pointer.Expression.Resize,
  options: EvaluateOptions,
): Promise<Value> {
  const [[operation, subexpression]] = Object.entries(expression);

  const newLength = Pointer.Expression.Resize.isToNumber(expression)
    ? Number(operation.match(/^\$sized([1-9]+[0-9]*)$/)![1])
    : 32;

  const value = await evaluate(subexpression, options);

  return Value.bytes(Value.toData(value).resizeTo(newLength));
}

async function evaluateLookup<O extends Pointer.Expression.Lookup.Operation>(
  operation: O,
  lookup: Pointer.Expression.Lookup.ForOperation<O>,
  options: EvaluateOptions,
): Promise<Value> {
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

  return Value.integer(data.asUint());
}

async function evaluateRead(
  expression: Pointer.Expression.Read,
  options: EvaluateOptions,
): Promise<Value> {
  const { state: _state, regions } = options;

  const identifier = expression.$read;
  const region = regions[identifier];
  if (!region) {
    throw new Error(`Region not found: ${identifier}`);
  }

  return Value.bytes(await read(region, options));
}
