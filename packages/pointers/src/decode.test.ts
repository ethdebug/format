import { expect, describe, it } from "vitest";

import { Data } from "./data.js";
import { decodeValue } from "./decode.js";

// Build a right-aligned 32-byte word from a hex value (numbers/addresses are
// stored right-aligned in an EVM word).
const word = (hexNo0x: string): Data =>
  Data.fromHex(`0x${hexNo0x.padStart(64, "0")}`);

describe("decodeValue", () => {
  describe("uint", () => {
    const type = { kind: "uint" as const, bits: 256 };

    it("decodes to decimal", () => {
      expect(decodeValue(word("02"), type)).toBe("2");
      expect(decodeValue(word("ff"), type)).toBe("255");
      expect(decodeValue(word("0100"), type)).toBe("256");
    });

    it("decodes zero", () => {
      expect(decodeValue(word("00"), type)).toBe("0");
    });

    it("decodes a large 256-bit value", () => {
      expect(decodeValue(Data.fromHex(`0x${"ff".repeat(32)}`), type)).toBe(
        (2n ** 256n - 1n).toString(10),
      );
    });

    it("decodes a tightly-stored uint8", () => {
      expect(decodeValue(new Data([0xff]), { kind: "uint", bits: 8 })).toBe(
        "255",
      );
    });
  });

  describe("int", () => {
    const type = { kind: "int" as const, bits: 256 };

    it("decodes positive values", () => {
      expect(decodeValue(word("05"), type)).toBe("5");
    });

    it("decodes -1 from a sign-extended full word", () => {
      expect(decodeValue(Data.fromHex(`0x${"ff".repeat(32)}`), type)).toBe(
        "-1",
      );
    });

    it("decodes a tightly-stored negative int8", () => {
      expect(decodeValue(new Data([0xfb]), { kind: "int", bits: 8 })).toBe(
        "-5",
      );
    });

    it("decodes int8 minimum", () => {
      expect(decodeValue(new Data([0x80]), { kind: "int", bits: 8 })).toBe(
        "-128",
      );
    });

    it("decodes zero", () => {
      expect(decodeValue(word("00"), type)).toBe("0");
    });
  });

  describe("bool", () => {
    const type = { kind: "bool" as const };

    it("decodes false and true", () => {
      expect(decodeValue(word("00"), type)).toBe("false");
      expect(decodeValue(word("01"), type)).toBe("true");
    });

    it("treats any nonzero as true", () => {
      expect(decodeValue(word("05"), type)).toBe("true");
    });
  });

  describe("address", () => {
    const type = { kind: "address" as const };

    it("decodes to an EIP-55 checksummed address", () => {
      // canonical EIP-55 test vector
      expect(
        decodeValue(word("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), type),
      ).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    });

    it("keeps the low 20 bytes of a wider word", () => {
      // leading nonzero bytes above the 20-byte address must be dropped
      const padded = Data.fromHex(
        `0xdeadbeef${"5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"}`,
      );
      expect(decodeValue(padded, type)).toBe(
        "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      );
    });
  });

  describe("bytesN", () => {
    it("decodes left-aligned static bytes4", () => {
      const leftAligned = Data.fromHex(`0xdeadbeef${"00".repeat(28)}`);
      expect(decodeValue(leftAligned, { kind: "bytes", size: 4 })).toBe(
        "0xdeadbeef",
      );
    });

    it("falls back to raw hex for dynamic bytes (no size)", () => {
      const data = Data.fromHex("0xdeadbeef");
      expect(decodeValue(data, { kind: "bytes" })).toBe("0xdeadbeef");
    });
  });

  describe("fallbacks (deferred / unhandled shapes)", () => {
    const data = word("2a");

    it("falls back to raw hex for string", () => {
      expect(decodeValue(data, { kind: "string" })).toBe(data.toHex());
    });

    it("falls back to raw hex for an unresolved { id } reference", () => {
      expect(decodeValue(data, { id: 5 })).toBe(data.toHex());
    });

    it("falls back to raw hex for a missing type", () => {
      expect(decodeValue(data, undefined)).toBe(data.toHex());
    });

    it("falls back to raw hex for aggregate kinds", () => {
      expect(decodeValue(data, { kind: "array" } as never)).toBe(data.toHex());
    });
  });
});
