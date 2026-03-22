import { expect, describe, it } from "vitest";

import { Data } from "./data.js";

describe("Data", () => {
  describe(".prototype.asUint()", () => {
    it("correctly converts to integers (big endian)", () => {
      const data = new Data([0x01, 0x00]);

      expect(`${data.asUint()}`).toBe("256");
    });
  });

  describe(".fromUint()", () => {
    it("correctly creates Data instances from bigints", () => {
      const data1 = Data.fromUint(0n);
      expect(data1).toEqual(new Data([]));

      const data2 = Data.fromUint(255n);
      expect(data2).toEqual(new Data([0xff]));

      const data3 = Data.fromUint(256n);
      expect(data3).toEqual(new Data([0x01, 0x00]));

      const data4 = Data.fromUint(1234567890n);
      expect(data4).toEqual(new Data([0x49, 0x96, 0x02, 0xd2]));
    });
  });

  describe(".fromNumber()", () => {
    it("correctly creates Data instances from numbers", () => {
      const data1 = Data.fromNumber(0);
      expect(data1).toEqual(Data.zero());

      const data2 = Data.fromNumber(255);
      expect(data2).toEqual(new Data([0xff]));

      const data3 = Data.fromNumber(256);
      expect(data3).toEqual(new Data([0x01, 0x00]));
    });
  });

  describe(".fromHex()", () => {
    it("correctly creates Data instances from hex strings", () => {
      const data1 = Data.fromHex("0x00");
      expect(data1).toEqual(new Data([0x00]));

      const data2 = Data.fromHex("0xff");
      expect(data2).toEqual(new Data([0xff]));

      const data3 = Data.fromHex("0x0100");
      expect(data3).toEqual(new Data([0x01, 0x00]));

      const data4 = Data.fromHex("0x499602d2");
      expect(data4).toEqual(new Data([0x49, 0x96, 0x02, 0xd2]));
    });

    it("throws an error for invalid hex string format", () => {
      expect(() => Data.fromHex("ff")).toThrow(
        'Invalid hex string format. Expected "0x" prefix.',
      );
    });
  });
});
