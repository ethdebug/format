import { describe, it, expect } from "vitest";
import { Data } from "@ethdebug/pointers";

import { decodeValue } from "./decodeValue.js";

const bytes = (hex: string) => Data.fromHex(hex);

describe("decodeValue", () => {
  it("decodes uint to decimal", () => {
    expect(decodeValue(bytes("0xc8"), { kind: "uint", bits: 8 })).toBe("200");
    expect(
      decodeValue(bytes(`0x${"ff".repeat(32)}`), { kind: "uint", bits: 256 }),
    ).toBe((2n ** 256n - 1n).toString(10));
  });

  it("decodes int as two's complement over the region width", () => {
    const int8 = { kind: "int", bits: 8 };
    expect(decodeValue(bytes("0x05"), int8)).toBe("5");
    expect(decodeValue(bytes("0xfb"), int8)).toBe("-5");
    expect(decodeValue(bytes("0x80"), int8)).toBe("-128");
  });

  it("decodes bool", () => {
    expect(decodeValue(bytes("0x00"), { kind: "bool" })).toBe("false");
    expect(decodeValue(bytes("0x01"), { kind: "bool" })).toBe("true");
  });

  it("decodes address with an EIP-55 checksum", () => {
    expect(
      decodeValue(bytes("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), {
        kind: "address",
      }),
    ).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  });

  it("shows other kinds, or no type, as hex", () => {
    const data = bytes("0xabcdef12");
    expect(decodeValue(data, { kind: "bytes", size: 4 })).toBe("0xabcdef12");
    expect(decodeValue(data, { kind: "string" })).toBe("0xabcdef12");
    expect(decodeValue(data, undefined)).toBe("0xabcdef12");
  });
});
