import { expect, describe, it, beforeEach } from "vitest";

import { keccak256 } from "ethereum-cryptography/keccak";
import { toHex } from "ethereum-cryptography/utils";

import { Pointer } from "@ethdebug/format";

import { Machine } from "./machine.js";
import { Data } from "./data.js";
import { Cursor } from "./cursor.js";
import { evaluate, type EvaluateOptions } from "./evaluate.js";

// Create a stub for the Machine.State interface
const state: Machine.State = {
  traceIndex: Promise.resolve(0n),
  opcode: Promise.resolve("PUSH1"),
  programCounter: Promise.resolve(10n),
  stack: {
    length: 50n,
  } as any,
  memory: {} as any,
  storage: {} as any,
  calldata: {} as any,
  returndata: {} as any,
  transient: {} as any,
  code: {} as any,
};

describe("evaluate", () => {
  let regions: { [identifier: string]: Cursor.Region };
  let variables: { [identifier: string]: Data };
  let _cursor: Cursor;
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
        slot: Data.fromNumber(42),
        offset: Data.fromNumber(0x60),
        length: Data.fromNumber(0x1f / 2),
      },
      memory: {
        name: "memory",
        location: "memory",
        offset: Data.fromNumber(0x20 * 0x05),
        length: Data.fromNumber(42 - 0x1f),
      },
    };

    options = {
      state,
      variables,
      regions,
    };
  });

  it("evaluates literal expressions", async () => {
    expect(await evaluate(42, options)).toEqual(Data.fromNumber(42));

    expect(await evaluate("0x1f", options)).toEqual(Data.fromHex("0x1f"));
  });

  it("evaluates constant expressions", async () => {
    expect(await evaluate("$wordsize", options)).toEqual(Data.fromHex("0x20"));
  });

  it("evaluates variable expressions", async () => {
    expect(await evaluate("foo", options)).toEqual(Data.fromNumber(42));

    expect(await evaluate("bar", options)).toEqual(Data.fromHex("0x1f"));
  });

  it("evaluates sum expressions", async () => {
    const expression: Pointer.Expression = {
      $sum: [42, "0x1f", "foo", "bar"],
    };

    expect(await evaluate(expression, options)).toEqual(
      Data.fromUint(42n + 0x1fn + 42n + 0x1fn),
    );
  });

  it("evaluates difference expressions", async () => {
    const expression: Pointer.Expression = {
      $difference: ["foo", "bar"],
    };

    expect(await evaluate(expression, options)).toEqual(
      Data.fromUint(42n - 0x1fn),
    );
  });

  it("evaluates product expressions", async () => {
    const expression: Pointer.Expression = {
      $product: [42, "0x1f", "foo", "bar"],
    };

    expect(await evaluate(expression, options)).toEqual(
      Data.fromUint(42n * 0x1fn * 42n * 0x1fn),
    );
  });

  it("evaluates quotient expressions", async () => {
    const expression: Pointer.Expression = {
      $quotient: ["foo", "bar"],
    };

    expect(await evaluate(expression, options)).toEqual(
      Data.fromUint(42n / 0x1fn),
    );
  });

  it("evaluates remainder expressions", async () => {
    const expression: Pointer.Expression = {
      $remainder: ["foo", "bar"],
    };

    expect(await evaluate(expression, options)).toEqual(
      Data.fromUint(42n % 0x1fn),
    );
  });

  describe("evaluates concat expressions", () => {
    it("concatenates hex literals", async () => {
      const expression: Pointer.Expression = {
        $concat: ["0x00", "0x00"],
      };
      expect(await evaluate(expression, options)).toEqual(
        Data.fromHex("0x0000"),
      );
    });

    it("concatenates multiple values preserving byte widths", async () => {
      const expression: Pointer.Expression = {
        $concat: ["0xdead", "0xbeef"],
      };
      expect(await evaluate(expression, options)).toEqual(
        Data.fromHex("0xdeadbeef"),
      );
    });

    it("returns empty data for empty operand list", async () => {
      const expression: Pointer.Expression = {
        $concat: [],
      };
      expect(await evaluate(expression, options)).toEqual(Data.zero());
    });

    it("preserves single operand unchanged", async () => {
      const expression: Pointer.Expression = {
        $concat: ["0xabcdef"],
      };
      expect(await evaluate(expression, options)).toEqual(
        Data.fromHex("0xabcdef"),
      );
    });

    it("concatenates variables", async () => {
      const expression: Pointer.Expression = {
        $concat: ["foo", "bar"],
      };
      // foo = 0x2a (42), bar = 0x1f
      expect(await evaluate(expression, options)).toEqual(
        Data.fromHex("0x2a1f"),
      );
    });

    it("concatenates nested expressions", async () => {
      const expression: Pointer.Expression = {
        $concat: [
          { $sum: [1, 2] }, // 3 = 0x03
          "0xff",
        ],
      };
      expect(await evaluate(expression, options)).toEqual(
        Data.fromHex("0x03ff"),
      );
    });

    it("preserves leading zeros in hex literals", async () => {
      const expression: Pointer.Expression = {
        $concat: ["0x0001", "0x0002"],
      };
      const result = await evaluate(expression, options);
      expect(result).toEqual(Data.fromHex("0x00010002"));
      expect(result.length).toBe(4);
    });
  });

  // skipped because test does not perform proper padding
  it.skip("evaluates keccak256 expressions", async () => {
    const expression: Pointer.Expression = {
      $keccak256: ["foo", "bar", 42, "0x1f"],
    };

    const expectedHash = keccak256(
      new Uint8Array(
        Buffer.from(
          toHex(Data.fromNumber(42)).slice(2) +
            toHex(Data.fromHex("0x1f")).slice(2) +
            toHex(variables.foo).slice(2) +
            toHex(variables.bar).slice(2),
          "hex",
        ),
      ),
    );

    expect(await evaluate(expression, options)).toEqual(
      Data.fromBytes(expectedHash),
    );
  });

  it("evaluates offset lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".offset": "stack",
    };

    expect(await evaluate(expression, options)).toEqual(Data.fromUint(0x60n));
  });

  it("evaluates offset lookup expressions with $this", async () => {
    const expression: Pointer.Expression = {
      ".offset": "$this",
    };

    const $this = {
      name: "$this",
      location: "memory",
      offset: Data.fromNumber(0x120),
      length: Data.fromNumber(0x40),
    } as const;

    expect(
      await evaluate(expression, {
        ...options,
        regions: {
          ...regions,
          $this,
        },
      }),
    ).toEqual(Data.fromUint(0x120n));
  });

  it("evaluates length lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".length": "memory",
    };

    expect(await evaluate(expression, options)).toEqual(Data.fromUint(11n));
  });

  it("evaluates slot lookup expressions", async () => {
    const expression: Pointer.Expression = {
      ".slot": "stack",
    };

    expect(await evaluate(expression, options)).toEqual(Data.fromNumber(42));
  });

  describe("resulting bytes widths", () => {
    it("uses the fewest bytes necessary for a literal", async () => {
      expect(await evaluate(0, options)).toHaveLength(0);
      expect(await evaluate("0x00", options)).toHaveLength(1);
      expect(await evaluate("0x0000", options)).toHaveLength(2);
      expect(await evaluate(0xffff, options)).toHaveLength(2);
    });

    it("uses at least the largest bytes width amongst arithmetic operands", async () => {
      expect(await evaluate({ $sum: [0, 0] }, options)).toHaveLength(0);

      expect(
        await evaluate({ $difference: ["0x00", "0x00"] }, options),
      ).toHaveLength(1);

      expect(
        await evaluate({ $remainder: ["0x0001", "0x01"] }, options),
      ).toHaveLength(2);
    });

    it("uses exactly as many bytes necessary to avoid arithmetic overflow", async () => {
      expect(
        await evaluate({ $product: ["0xffff", "0xff"] }, options),
      ).toHaveLength(3);
    });
  });

  it("evaluates resize expressions", async () => {
    expect(await evaluate({ $sized1: 0 }, options)).toHaveLength(1);

    {
      const data = await evaluate({ $sized1: "0xabcd" }, options);
      expect(data).toHaveLength(1);
      expect(data).toEqual(Data.fromNumber(0xcd));
    }

    {
      const data = await evaluate({ $wordsized: "0xabcd" }, options);
      expect(data).toHaveLength(32);
      expect(data).toEqual(Data.fromNumber(0xabcd).resizeTo(32));
    }
  });
});
