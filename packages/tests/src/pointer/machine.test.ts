import { expect, describe, it } from "@jest/globals";

import { Machine } from "./machine.js";

describe("Data", () => {
  describe(".prototype.asUint()", () => {
    it("correctly converts to integers (big endian)", () => {
      const data = new Machine.Data([0x01, 0x00]);

      expect(`${data.asUint()}`).toBe("256");
    });
  });

  describe(".fromUint()", () => {
    it("correctly creates Data instances from bigints", () => {
      const data1 = Machine.Data.fromUint(0n);
      expect(data1).toEqual(new Machine.Data([]));

      const data2 = Machine.Data.fromUint(255n);
      expect(data2).toEqual(new Machine.Data([0xff]));

      const data3 = Machine.Data.fromUint(256n);
      expect(data3).toEqual(new Machine.Data([0x01, 0x00]));

      const data4 = Machine.Data.fromUint(1234567890n);
      expect(data4).toEqual(new Machine.Data([0x49, 0x96, 0x02, 0xd2]));
    });
  });

  describe(".fromNumber()", () => {
    it("correctly creates Data instances from numbers", () => {
      const data1 = Machine.Data.fromNumber(0);
      expect(data1).toEqual(Machine.Data.zero());

      const data2 = Machine.Data.fromNumber(255);
      expect(data2).toEqual(new Machine.Data([0xff]));

      const data3 = Machine.Data.fromNumber(256);
      expect(data3).toEqual(new Machine.Data([0x01, 0x00]));
    });
  });

  describe(".fromHex()", () => {
    it("correctly creates Data instances from hex strings", () => {
      const data1 = Machine.Data.fromHex("0x00");
      expect(data1).toEqual(new Machine.Data([0x00]));

      const data2 = Machine.Data.fromHex("0xff");
      expect(data2).toEqual(new Machine.Data([0xff]));

      const data3 = Machine.Data.fromHex("0x0100");
      expect(data3).toEqual(new Machine.Data([0x01, 0x00]));

      const data4 = Machine.Data.fromHex("0x499602d2");
      expect(data4).toEqual(new Machine.Data([0x49, 0x96, 0x02, 0xd2]));
    });

    it("throws an error for invalid hex string format", () => {
      expect(() => Machine.Data.fromHex("ff")).toThrow("Invalid hex string format. Expected \"0x\" prefix.");
    });
  });
});

describe("Word", () => {
  describe(".prototype.asUint", () => {
    it("correctly converts to integers (big endian)", () => {
      const word = new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
      ]);

      expect(`${word.asUint()}`).toBe("256");
    });
  });

  describe(".fromUint()", () => {
    it("correctly creates Word instances from BigInt values", () => {
      const word1 = Machine.Word.fromUint(0n);
      expect(word1).toEqual(Machine.Word.zero());

      const word2 = Machine.Word.fromUint(255n);
      expect(word2).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
      ]));

      const word3 = Machine.Word.fromUint(256n);
      expect(word3).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
      ]));

      const word4 = Machine.Word.fromUint(1234567890n);
      expect(word4).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x96, 0x02, 0xd2,
      ]));
    });
  });

  describe(".fromNumber()", () => {
    it("correctly creates Word instances from unsigned integers", () => {
      const word1 = Machine.Word.fromNumber(0);
      expect(word1).toEqual(Machine.Word.zero());

      const word2 = Machine.Word.fromNumber(255);
      expect(word2).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
      ]));

      const word3 = Machine.Word.fromNumber(256);
      expect(word3).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
      ]));

    });
  });

  describe(".fromHex()", () => {
    it("correctly creates Word instances from hex strings", () => {
      const word1 = Machine.Word.fromHex(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
      expect(word1).toEqual(Machine.Word.zero());

      const word2 = Machine.Word.fromHex(
        "0x00000000000000000000000000000000000000000000000000000000000000ff"
      );
      expect(word2).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
      ]));

      const word3 = Machine.Word.fromHex("0x0000000000000000000000000000000000000000000000000000000000000100");
      expect(word3).toEqual(new Machine.Word([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
      ]));
    });
  });
});

