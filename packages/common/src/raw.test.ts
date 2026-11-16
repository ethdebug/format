import { expect, describe, it } from "vitest";

import { Raw } from "#raw";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("Raw", () => {
  describe(".asUint()", () => {
    it("correctly converts to integers (big endian)", () => {
      expect(`${Raw.asUint(bytes(0x01, 0x00))}`).toBe("256");
    });

    it("gives 0n for an empty Raw", () => {
      expect(Raw.asUint(Raw.zero())).toBe(0n);
    });
  });

  describe(".fromUint()", () => {
    it("correctly creates Raw values from bigints", () => {
      expect(Raw.fromUint(0n)).toEqual(bytes());
      expect(Raw.fromUint(255n)).toEqual(bytes(0xff));
      expect(Raw.fromUint(256n)).toEqual(bytes(0x01, 0x00));
      expect(Raw.fromUint(1234567890n)).toEqual(bytes(0x49, 0x96, 0x02, 0xd2));
    });
  });

  describe(".fromNumber()", () => {
    it("correctly creates Raw values from numbers", () => {
      expect(Raw.fromNumber(0)).toEqual(Raw.zero());
      expect(Raw.fromNumber(0)).toEqual(bytes());
      expect(Raw.fromNumber(255)).toEqual(bytes(0xff));
      expect(Raw.fromNumber(256)).toEqual(bytes(0x01, 0x00));
    });
  });

  describe(".fromHex()", () => {
    it("correctly creates Raw values from hex strings", () => {
      expect(Raw.fromHex("0x00")).toEqual(bytes(0x00));
      expect(Raw.fromHex("0xff")).toEqual(bytes(0xff));
      expect(Raw.fromHex("0x0100")).toEqual(bytes(0x01, 0x00));
      expect(Raw.fromHex("0x499602d2")).toEqual(bytes(0x49, 0x96, 0x02, 0xd2));
    });

    it("reads an odd digit count as one byte per pair", () => {
      expect(Raw.fromHex("0x1")).toEqual(bytes(0x01));
    });

    it("throws an error for invalid hex string format", () => {
      expect(() => Raw.fromHex("ff")).toThrow(
        'Invalid hex string format. Expected "0x" prefix.',
      );
    });
  });

  describe(".toHex()", () => {
    it("gives a 0x-prefixed hex string", () => {
      expect(Raw.toHex(bytes(0x01, 0xab))).toBe("0x01ab");
      expect(Raw.toHex(Raw.zero())).toBe("0x");
    });
  });

  describe(".concat()", () => {
    it("joins the bytes in order", () => {
      expect(Raw.concat(bytes(1), bytes(), bytes(2, 3))).toEqual(
        bytes(1, 2, 3),
      );
    });

    it("gives an empty Raw with no operands", () => {
      expect(Raw.concat()).toEqual(bytes());
    });
  });

  describe(".resizeTo()", () => {
    it("keeps the low-order bytes when shorter", () => {
      expect(Raw.resizeTo(bytes(1, 2, 3), 2)).toEqual(bytes(2, 3));
    });

    it("pads on the left when longer", () => {
      expect(Raw.resizeTo(bytes(1), 3)).toEqual(bytes(0, 0, 1));
    });

    it("returns the same object at equal length", () => {
      const raw = bytes(1, 2);
      expect(Raw.resizeTo(raw, raw.length)).toBe(raw);
    });
  });

  describe(".padUntilAtLeast()", () => {
    it("pads on the left when shorter", () => {
      expect(Raw.padUntilAtLeast(bytes(1), 3)).toEqual(bytes(0, 0, 1));
    });

    it("returns the same object when long enough", () => {
      const raw = bytes(1, 2);
      expect(Raw.padUntilAtLeast(raw, 1)).toBe(raw);
    });
  });
});
