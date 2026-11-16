import { expect, describe, it } from "vitest";

import { Raw } from "#raw";
import { keccak256 } from "#keccak";

describe("keccak256", () => {
  it("hashes the empty string", () => {
    expect(Raw.toHex(keccak256(Raw.zero()))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("hashes a zero word", () => {
    expect(Raw.toHex(keccak256(Raw.fromHex("0x" + "00".repeat(32))))).toBe(
      "0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
    );
  });
});
