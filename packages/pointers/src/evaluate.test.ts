import { vitest, expect, describe, it, beforeEach } from "vitest";

import { keccak256 } from "ethereum-cryptography/keccak";

import { Pointer } from "@ethdebug/format";

import { Machine } from "#machine";
import { Data } from "#data";
import { Cursor } from "#cursor";
import { evaluate, Value, type EvaluateOptions } from "./evaluate.js";

// Create a stub for the Machine.State interface
const state: Machine.State = {
  traceIndex: Promise.resolve(0n),
  opcode: Promise.resolve("PUSH1"),
  programCounter: Promise.resolve(10n),
  stack: {
    length: 50n,
  } as any,
  memory: {
    read: vitest.fn(async ({ slice: { length } }) =>
      Data.fromBytes(new Uint8Array(Number(length)).fill(0xee)),
    ),
  } as any,
  storage: {} as any,
  calldata: {} as any,
  returndata: {} as any,
  transient: {} as any,
  code: {} as any,
};

const word = (byte: number): Data =>
  Data.fromBytes(new Uint8Array(32).fill(byte));

describe("evaluate", () => {
  let regions: { [identifier: string]: Cursor.Region };
  let variables: { [identifier: string]: Value };
  let options: EvaluateOptions;

  beforeEach(() => {
    variables = {
      foo: Value.integer(42n),
      bar: Value.bytes(Data.fromHex("0x1f")),
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

  describe("literals", () => {
    it("evaluates a JSON number to an integer", async () => {
      expect(await evaluate(42, options)).toEqual(Value.integer(42n));
      expect(await evaluate(0, options)).toEqual(Value.integer(0n));
    });

    it("evaluates even-digit hex to bytes of that width", async () => {
      expect(await evaluate("0x1f", options)).toEqual(
        Value.bytes(Data.fromHex("0x1f")),
      );

      const zeros = await evaluate("0x0000", options);
      expect(zeros).toEqual(Value.bytes(Data.fromHex("0x0000")));
      expect(Value.isBytes(zeros) && zeros.data.length).toBe(2);
    });

    it("evaluates an odd-digit hex string to an integer", async () => {
      expect(await evaluate("0x1", options)).toEqual(Value.integer(1n));
      expect(await evaluate("0xabc", options)).toEqual(Value.integer(0xabcn));
    });
  });

  it("evaluates $wordsize to the integer 32", async () => {
    expect(await evaluate("$wordsize", options)).toEqual(Value.integer(32n));
  });

  it("evaluates variables to their values, preserving sort", async () => {
    expect(await evaluate("foo", options)).toEqual(Value.integer(42n));

    expect(await evaluate("bar", options)).toEqual(
      Value.bytes(Data.fromHex("0x1f")),
    );
  });

  it("throws for unknown variables", async () => {
    await expect(evaluate("baz", options)).rejects.toThrow(
      "Unknown variable with identifier baz",
    );
  });

  describe("arithmetic", () => {
    it("evaluates sums to an integer, coercing bytes operands", async () => {
      const expression: Pointer.Expression = {
        $sum: [42, "0x1f", "foo", "bar"],
      };

      expect(await evaluate(expression, options)).toEqual(
        Value.integer(42n + 0x1fn + 42n + 0x1fn),
      );
    });

    it("evaluates differences", async () => {
      expect(await evaluate({ $difference: ["foo", "bar"] }, options)).toEqual(
        Value.integer(42n - 0x1fn),
      );
    });

    it("clamps differences at zero", async () => {
      expect(await evaluate({ $difference: ["bar", "foo"] }, options)).toEqual(
        Value.integer(0n),
      );
    });

    it("evaluates products", async () => {
      const expression: Pointer.Expression = {
        $product: [42, "0x1f", "foo", "bar"],
      };

      expect(await evaluate(expression, options)).toEqual(
        Value.integer(42n * 0x1fn * 42n * 0x1fn),
      );
    });

    it("evaluates quotients", async () => {
      expect(await evaluate({ $quotient: ["foo", "bar"] }, options)).toEqual(
        Value.integer(42n / 0x1fn),
      );
    });

    it("evaluates remainders", async () => {
      expect(await evaluate({ $remainder: ["foo", "bar"] }, options)).toEqual(
        Value.integer(42n % 0x1fn),
      );
    });

    it("reads bytes operands as big-endian integers", async () => {
      expect(await evaluate({ $sum: ["0x0100", "0x00"] }, options)).toEqual(
        Value.integer(256n),
      );
    });

    it("produces integers with no width, even from wide operands", async () => {
      expect(
        await evaluate({ $difference: ["0x0000", "0x0000"] }, options),
      ).toEqual(Value.integer(0n));
    });
  });

  describe("lookups", () => {
    it("evaluates offset lookups to an integer", async () => {
      expect(await evaluate({ ".offset": "stack" }, options)).toEqual(
        Value.integer(0x60n),
      );
    });

    it("evaluates offset lookups with $this", async () => {
      const $this = {
        name: "$this",
        location: "memory",
        offset: Data.fromNumber(0x120),
        length: Data.fromNumber(0x40),
      } as const;

      expect(
        await evaluate(
          { ".offset": "$this" },
          {
            ...options,
            regions: {
              ...regions,
              $this,
            },
          },
        ),
      ).toEqual(Value.integer(0x120n));
    });

    it("evaluates length lookups", async () => {
      expect(await evaluate({ ".length": "memory" }, options)).toEqual(
        Value.integer(11n),
      );
    });

    it("evaluates slot lookups", async () => {
      expect(await evaluate({ ".slot": "stack" }, options)).toEqual(
        Value.integer(42n),
      );
    });

    it("throws for lookups of unknown regions", async () => {
      await expect(evaluate({ ".slot": "nope" }, options)).rejects.toThrow(
        "Region not found: nope",
      );
    });
  });

  it("evaluates $read to bytes of the region's length", async () => {
    const result = await evaluate({ $read: "memory" }, options);

    expect(result).toEqual(
      Value.bytes(Data.fromBytes(new Uint8Array(11).fill(0xee))),
    );
  });

  describe("resize", () => {
    it("gives an integer a width", async () => {
      expect(await evaluate({ $sized1: 0 }, options)).toEqual(
        Value.bytes(Data.fromHex("0x00")),
      );

      expect(await evaluate({ $sized2: 42 }, options)).toEqual(
        Value.bytes(Data.fromHex("0x002a")),
      );

      expect(await evaluate({ $wordsized: 0xabcd }, options)).toEqual(
        Value.bytes(Data.fromNumber(0xabcd).resizeTo(32)),
      );
    });

    it("resizes bytes, padding or truncating on the left", async () => {
      expect(await evaluate({ $sized1: "0xabcd" }, options)).toEqual(
        Value.bytes(Data.fromHex("0xcd")),
      );

      expect(await evaluate({ $sized4: "0xabcd" }, options)).toEqual(
        Value.bytes(Data.fromHex("0x0000abcd")),
      );

      expect(await evaluate({ $wordsized: "0xabcd" }, options)).toEqual(
        Value.bytes(Data.fromHex("0xabcd").resizeTo(32)),
      );
    });

    it("truncates an integer too large for the requested width", async () => {
      expect(await evaluate({ $sized1: 0x1234 }, options)).toEqual(
        Value.bytes(Data.fromHex("0x34")),
      );
    });

    it("gives arithmetic results a width", async () => {
      expect(await evaluate({ $sized2: { $sum: [1, 2] } }, options)).toEqual(
        Value.bytes(Data.fromHex("0x0003")),
      );
    });
  });

  describe("$concat", () => {
    it("concatenates hex literals", async () => {
      expect(await evaluate({ $concat: ["0x00", "0x00"] }, options)).toEqual(
        Value.bytes(Data.fromHex("0x0000")),
      );
    });

    it("concatenates multiple values preserving byte widths", async () => {
      expect(
        await evaluate({ $concat: ["0xdead", "0xbeef"] }, options),
      ).toEqual(Value.bytes(Data.fromHex("0xdeadbeef")));
    });

    it("returns empty bytes for an empty operand list", async () => {
      expect(await evaluate({ $concat: [] }, options)).toEqual(
        Value.bytes(Data.zero()),
      );
    });

    it("preserves a single operand unchanged", async () => {
      expect(await evaluate({ $concat: ["0xabcdef"] }, options)).toEqual(
        Value.bytes(Data.fromHex("0xabcdef")),
      );
    });

    it("preserves leading zeros in hex literals", async () => {
      const result = await evaluate({ $concat: ["0x0001", "0x0002"] }, options);

      expect(result).toEqual(Value.bytes(Data.fromHex("0x00010002")));
    });

    it("concatenates bytes-valued variables and resized integers", async () => {
      const expression: Pointer.Expression = {
        $concat: [{ $sized2: "foo" }, "bar", { $sized1: { $sum: [1, 2] } }],
      };

      expect(await evaluate(expression, options)).toEqual(
        Value.bytes(Data.fromHex("0x002a1f03")),
      );
    });

    it("rejects a JSON number operand", async () => {
      await expect(
        evaluate({ $concat: ["0xdead", 0] }, options),
      ).rejects.toThrow(
        "Operand 1 of $concat (0) evaluates to the integer 0, which has no " +
          "byte width; give it a width with $wordsized or $sizedN",
      );
    });

    it("rejects an integer-valued variable operand", async () => {
      await expect(
        evaluate({ $concat: ["foo", "bar"] }, options),
      ).rejects.toThrow(
        'Operand 0 of $concat ("foo") evaluates to the integer 42',
      );
    });

    it("rejects an arithmetic result operand", async () => {
      await expect(
        evaluate({ $concat: [{ $sum: [1, 2] }, "0xff"] }, options),
      ).rejects.toThrow("evaluates to the integer 3");
    });

    it("rejects an odd-digit hex literal operand", async () => {
      await expect(evaluate({ $concat: ["0x1"] }, options)).rejects.toThrow(
        "evaluates to the integer 1",
      );
    });

    it("rejects $wordsize and lookups as operands", async () => {
      await expect(
        evaluate({ $concat: ["$wordsize"] }, options),
      ).rejects.toThrow("evaluates to the integer 32");

      await expect(
        evaluate({ $concat: [{ ".slot": "stack" }] }, options),
      ).rejects.toThrow("evaluates to the integer 42");
    });
  });

  describe("$keccak256", () => {
    it("hashes the concatenation of bytes operands", async () => {
      const expression: Pointer.Expression = {
        $keccak256: [{ $wordsized: "foo" }, "bar", { $sized1: 42 }, "0x1f"],
      };

      const preimage = Data.fromNumber(42)
        .resizeTo(32)
        .concat(
          Data.fromHex("0x1f"),
          Data.fromHex("0x2a"),
          Data.fromHex("0x1f"),
        );

      expect(await evaluate(expression, options)).toEqual(
        Value.bytes(Data.fromBytes(keccak256(preimage))),
      );
    });

    it("produces 32 bytes", async () => {
      const result = await evaluate({ $keccak256: [] }, options);

      expect(Value.isBytes(result) && result.data.length).toBe(32);
      expect(result).toEqual(
        Value.bytes(Data.fromBytes(keccak256(new Uint8Array(0)))),
      );
    });

    it("hashes a word-sized key and slot over 64 bytes", async () => {
      const expression: Pointer.Expression = {
        $keccak256: [{ $wordsized: "0x1234" }, { $wordsized: 0 }],
      };

      const preimage = Data.fromHex("0x1234").resizeTo(32).concat(word(0));
      expect(preimage).toHaveLength(64);

      expect(await evaluate(expression, options)).toEqual(
        Value.bytes(Data.fromBytes(keccak256(preimage))),
      );
    });

    it("rejects a bare integer slot operand", async () => {
      // the shape `{ $keccak256: [{ $wordsized: key }, slot] }` with a bare
      // integer slot would hash 32 bytes instead of 64
      await expect(
        evaluate({ $keccak256: [{ $wordsized: "0x1234" }, 0] }, options),
      ).rejects.toThrow(
        "Operand 1 of $keccak256 (0) evaluates to the integer 0, which has " +
          "no byte width; give it a width with $wordsized or $sizedN",
      );
    });

    it("rejects an integer-valued variable operand", async () => {
      await expect(evaluate({ $keccak256: ["foo"] }, options)).rejects.toThrow(
        'Operand 0 of $keccak256 ("foo")',
      );
    });
  });
});

describe("Value", () => {
  it("coerces bytes to a big-endian integer", () => {
    expect(Value.toInteger(Value.bytes(Data.fromHex("0x0100")))).toBe(256n);
    expect(Value.toInteger(Value.bytes(Data.zero()))).toBe(0n);
    expect(Value.toInteger(Value.integer(7n))).toBe(7n);
  });

  it("encodes an integer as minimal big-endian bytes for region data", () => {
    expect(Value.toData(Value.integer(0n))).toEqual(Data.zero());
    expect(Value.toData(Value.integer(256n))).toEqual(Data.fromHex("0x0100"));
    expect(Value.toData(Value.bytes(Data.fromHex("0x0000")))).toEqual(
      Data.fromHex("0x0000"),
    );
  });
});
