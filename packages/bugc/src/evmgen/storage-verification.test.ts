import { describe, it, expect } from "vitest";
import { executeProgram } from "#test/evm/behavioral";

describe("Storage verification", () => {
  it("should store array values correctly in constructor", async () => {
    const source = `
      name ConstructorArray;

      storage {
        [0] items: array<uint256, 3>;
      }

      create {
        items[0] = 1005;
        items[1] = 1006;
        items[2] = 1007;
      }

      code {}
    `;

    const result = await executeProgram(source);

    // A fixed-size array is inline: its elements start at its slot
    for (const [slot, value] of [
      [0n, 1005n],
      [1n, 1006n],
      [2n, 1007n],
    ]) {
      expect(await result.getStorage(slot)).toBe(value);
    }
  });

  it("should store direct storage values correctly", async () => {
    const source = `
      name DirectStorage;

      storage {
        [0] a: uint256;
        [1] b: uint256;
        [2] c: uint256;
      }

      create {
        a = 100;
        b = 200;
        c = 300;
      }

      code {}
    `;

    const result = await executeProgram(source);

    for (const [slot, value] of [
      [0n, 100n],
      [1n, 200n],
      [2n, 300n],
    ]) {
      expect(await result.getStorage(slot)).toBe(value);
    }
  });
});
