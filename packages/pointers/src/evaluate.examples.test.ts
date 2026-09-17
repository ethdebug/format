import { expect, describe, it } from "vitest";

import { Pointer, schemaIds, schemas } from "@ethdebug/format";

import type { Machine } from "#machine";
import { Data } from "#data";
import type { Cursor } from "#cursor";
import { evaluate, Value, type EvaluateOptions } from "./evaluate.js";

/**
 * Every `$keccak256` / `$concat` expression appearing in the examples of
 * the pointer schemas, along with the `define`d variable names seen along
 * the way (so that a variable can be stubbed with the sort of its defining
 * expression).
 *
 * Only the operand sorts are of interest here, so regions and variables
 * are stubbed rather than dereferenced. Undefined variables (e.g. those a
 * template `expect`s) are stubbed as integers, the stricter sort.
 */
interface Occurrence {
  schemaId: string;
  expression: Pointer.Expression.Keccak256 | Pointer.Expression.Concat;
}

const isWidthSensitive = (value: unknown): value is Occurrence["expression"] =>
  Pointer.Expression.isKeccak256(value) || Pointer.Expression.isConcat(value);

const occurrences: Occurrence[] = [];
const definedVariables: { [identifier: string]: Value } = {};

// stub value for a variable, by the syntactic sort of its defining expression
function stubValue(expression: Pointer.Expression): Value {
  if (
    Pointer.Expression.isResize(expression) ||
    Pointer.Expression.isRead(expression) ||
    isWidthSensitive(expression)
  ) {
    return Value.bytes(Data.fromNumber(0).resizeTo(32));
  }

  if (typeof expression === "string" && expression.startsWith("0x")) {
    return (expression.length - 2) % 2 === 0
      ? Value.bytes(Data.fromHex(expression))
      : Value.integer(BigInt(expression));
  }

  return Value.integer(1n);
}

function collect(schemaId: string, node: unknown, withinExamples: boolean) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collect(schemaId, item, withinExamples);
    }
    return;
  }

  if (typeof node !== "object" || node === null) {
    return;
  }

  const record = node as { [key: string]: unknown };

  if (withinExamples) {
    if (isWidthSensitive(record)) {
      occurrences.push({ schemaId, expression: record });
    }

    if (Pointer.Collection.isScope(record)) {
      for (const [identifier, expression] of Object.entries(record.define)) {
        definedVariables[identifier] = stubValue(expression);
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    collect(schemaId, value, withinExamples || key === "examples");
  }
}

for (const schemaId of schemaIds) {
  if (schemaId.startsWith("schema:ethdebug/format/pointer")) {
    collect(schemaId, schemas[schemaId], false);
  }
}

const zeros = async ({
  slice: { length },
}: {
  slice: Machine.State.Slice;
}): Promise<Data> => Data.fromBytes(new Uint8Array(Number(length)));

const state = {
  memory: { read: zeros },
} as unknown as Machine.State;

// any region name resolves to a stub memory region
const regions = new Proxy({} as { [identifier: string]: Cursor.Region }, {
  get: (_target, name): Cursor.Region => ({
    name: String(name),
    location: "memory",
    offset: Data.fromNumber(0),
    length: Data.fromNumber(32),
  }),
});

// any variable name resolves to its defined stub, or else an integer
const variables = new Proxy(definedVariables, {
  get: (target, name): Value => target[String(name)] ?? Value.integer(1n),
});

const options: EvaluateOptions = { state, regions, variables };

describe("pointer schema examples", () => {
  it("include width-sensitive expressions", () => {
    expect(occurrences.length).toBeGreaterThan(0);
  });

  for (const { schemaId, expression } of occurrences) {
    const title = `${schemaId}: ${JSON.stringify(expression)}`;

    it(`give every operand a width in ${title}`, async () => {
      const result = await evaluate(expression, options);

      expect(Value.isBytes(result)).toBe(true);
    });
  }
});
