import { expect, describe, it, beforeEach } from "@jest/globals";
import { Machine } from "./machine.js";
import { Pointer } from "./pointer.js";
import { evaluate } from "./evaluate.js";

// Create a stub for the Machine interface
const machineMock: Machine = {
  stack: {} as any,
  memory: {} as any,
  storage: {} as any,
  calldata: {} as any,
  returndata: {} as any,
  transient: {} as any,
  code: {} as any,
};

describe("evaluate", () => {
  let variables: { [identifier: string]: Machine.Data };

  beforeEach(() => {
    variables = {
      foo: Machine.Data.fromNumber(42),
      bar: Machine.Data.fromHex("0x1f"),
    };
  });

  it("evaluates literal expressions", () => {
    expect(evaluate({ expression: 42, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromNumber(42));

    expect(evaluate({ expression: "0x1f", machine: machineMock, variables }))
      .toEqual(Machine.Data.fromHex("0x1f"));
  });

  it("evaluates constant expressions", () => {
    expect(evaluate({ expression: "$wordsize", machine: machineMock, variables }))
      .toEqual(Machine.Data.fromHex("0x20"));
  });

  it("evaluates variable expressions", () => {
    expect(evaluate({ expression: "foo", machine: machineMock, variables }))
      .toEqual(Machine.Data.fromNumber(42));

    expect(evaluate({ expression: "bar", machine: machineMock, variables }))
      .toEqual(Machine.Data.fromHex("0x1f"));

    expect(evaluate({ expression: "baz", machine: machineMock, variables }))
      .toEqual(Machine.Word.zero());
  });

  it("evaluates sum expressions", () => {
    const expression: Pointer.Expression = {
      $sum: [42, "0x1f", "foo", "bar"]
    };

    expect(evaluate({ expression, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromUint(42n + 0x1fn + 42n + 0x1fn));
  });

  it("evaluates difference expressions", () => {
    const expression: Pointer.Expression = {
      $difference: ["foo", "bar"]
    };

    expect(evaluate({ expression, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromUint(42n - 0x1fn));
  });

  it("evaluates product expressions", () => {
    const expression: Pointer.Expression = {
      $product: [42, "0x1f", "foo", "bar"]
    };

    expect(evaluate({ expression, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromUint(42n * 0x1fn * 42n * 0x1fn));
  });

  it("evaluates quotient expressions", () => {
    const expression: Pointer.Expression = {
      $quotient: ["foo", "bar"]
    };

    expect(evaluate({ expression, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromUint(42n / 0x1fn));
  });

  it("evaluates remainder expressions", () => {
    const expression: Pointer.Expression = {
      $remainder: ["foo", "bar"]
    };

    expect(evaluate({ expression, machine: machineMock, variables }))
      .toEqual(Machine.Data.fromUint(42n % 0x1fn));
  });

  it("throws an error for unimplemented expressions", () => {
    const expression: Pointer.Expression = {
      $read: "foo"
    };

    expect(() => evaluate({ expression, machine: machineMock, variables }))
      .toThrow("not implemented");
  });
});
