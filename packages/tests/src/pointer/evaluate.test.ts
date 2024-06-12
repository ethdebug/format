import { expect, describe, it, beforeEach } from "@jest/globals";
import { keccak256 } from "ethereum-cryptography/keccak";
import { toHex } from "ethereum-cryptography/utils";
import { Machine } from "./machine.js";
import { Data } from "./data.js";
import { Pointer } from "./pointer.js";
import { evaluate, type EvaluateOptions } from "./evaluate.js";

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
  let variables: { [identifier: string]: Data };
  let regions: { [identifier: string]: Pointer.Region };
  let options: EvaluateOptions;

  beforeEach(() => {
    variables = {
      foo: Data.fromNumber(42),
      bar: Data.fromHex("0x1f"),
    };

    regions = {
      stack: {
        name: "stack",
        location: "stack",
        slot: "foo",
        offset: {
          $sum: [0x20, 0x40]
        },
        length: {
          $quotient: ["bar", 2]
        }
      },
      memory: {
        name: "memory",
        location: "memory",
        offset: {
          $product: [0x20, 0x05]
        },
        length: {
          $difference: ["foo", "bar"]
        }
      }
    };

    options = {
      machine: machineMock,
      variables,
      regions
    }
  });

  it("evaluates literal expressions", async () => {
    expect(await evaluate(42, options))
      .toEqual(Data.fromNumber(42));

    expect(await evaluate("0x1f", options))
      .toEqual(Data.fromHex("0x1f"));
  });

  it("evaluates constant expressions", async () => {
    expect(await evaluate("$wordsize", options))
      .toEqual(Data.fromHex("0x20"));
  });

  it("evaluates variable expressions", async () => {
    expect(await evaluate("foo", options))
      .toEqual(Data.fromNumber(42));

    expect(await evaluate("bar", options))
      .toEqual(Data.fromHex("0x1f"));

    expect(await evaluate("baz", options))
      .toEqual(Data.Word.zero());
  });

  it("evaluates sum expressions", async () => {
    const expression: Pointer.Expression = {
      $sum: [42, "0x1f", "foo", "bar"]
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(42n + 0x1fn + 42n + 0x1fn));
  });

  it("evaluates difference expressions", async () => {
    const expression: Pointer.Expression = {
      $difference: ["foo", "bar"]
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(42n - 0x1fn));
  });

  it("evaluates product expressions", async () => {
    const expression: Pointer.Expression = {
      $product: [42, "0x1f", "foo", "bar"]
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(42n * 0x1fn * 42n * 0x1fn));
  });

  it("evaluates quotient expressions", async () => {
    const expression: Pointer.Expression = {
      $quotient: ["foo", "bar"]
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(42n / 0x1fn));
  });

  it("evaluates remainder expressions", async () => {
    const expression: Pointer.Expression = {
      $remainder: ["foo", "bar"]
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(42n % 0x1fn));
  });

  it("evaluates keccak256 expressions", async () => {
    const expression: Pointer.Expression = {
      $keccak256: ["foo", "bar", 42, "0x1f"]
    };

    const expectedHash = keccak256(
      Buffer.from(
        toHex(Data.fromNumber(42)).slice(2) +
        toHex(Data.fromHex("0x1f")).slice(2) +
        toHex(variables.foo).slice(2) +
        toHex(variables.bar).slice(2),
        "hex"
      )
    );

    expect(await evaluate(expression, options))
      .toEqual(Data.fromBytes(expectedHash));
  });

  it("evaluates offset lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".offset": "stack"
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(0x60n));
  });

  it("evaluates offset lookup expressions with $this", async () => {
    const expression: Pointer.Expression = {
      ".offset": "$this"
    };

    const $this: Pointer.Region = {
      location: "memory",
      offset: {
        $sum: [0x100, 0x20]
      },
      length: 0x40
    };

    expect(
      await evaluate(expression, {
        ...options,
        regions: {
          ...regions,
          $this
        }
      })
    ).toEqual(Data.fromUint(0x120n));
  });

  it("evaluates length lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".length": "memory"
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromUint(11n));
  });

  it("evaluates length lookup expressions with $this", async () => {
    const expression: Pointer.Expression = {
      ".length": "$this"
    };

    const $this: Pointer.Region = {
      location: "memory",
      offset: 0x100,
      length: {
        $product: [0x20, 0x02]
      }
    };

    expect(
      await evaluate(expression, {
        ...options,
        regions: {
          ...regions,
          $this
        }
      })
    ).toEqual(Data.fromUint(0x40n));
  });

  it("evaluates slot lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".slot": "stack"
    };

    expect(await evaluate(expression, options))
      .toEqual(Data.fromNumber(42));
  });

  it("evaluates slot lookup expressions with $this", async () => {
    const expression: Pointer.Expression = {
      ".slot": "$this"
    };

    const $this: Pointer.Region = {
      location: "storage",
      slot: "bar",
      length: 0x20
    };

    expect(
      await evaluate(expression, {
        ...options,
        regions: {
          ...regions,
          $this
        }
      })
    ).toEqual(Data.fromHex("0x1f"));
  });
});
