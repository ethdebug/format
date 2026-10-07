import { describe, it, expect } from "vitest";
import { bytesToHex } from "ethereum-cryptography/utils";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";

// Solidity's revert data for an index out of bounds: Panic(0x32)
const panic32 = "4e487b71" + 0x32n.toString(16).padStart(64, "0");

const levels = [0, 1, 2, 3] as const;

// Each program writes its results to storage slots 0, 1, ...; it is
// called with the calldata given, if any
type Passes = Record<string, [string, bigint[], string?]>;

// Each program must revert with Panic(0x32) when called with the
// calldata given, if any
type Reverts = Record<string, [string, string?]>;

function passes(programs: Passes) {
  for (const [name, [body, expected, calldata = ""]] of Object.entries(
    programs,
  )) {
    for (const level of levels) {
      it(`should ${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Program;\n${body}`, {
          calldata,
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        for (const [slot, value] of expected.entries()) {
          expect(await result.getStorage(BigInt(slot))).toBe(value);
        }
      });
    }
  }
}

function reverts(programs: Reverts) {
  for (const [name, [body, calldata = ""]] of Object.entries(programs)) {
    for (const level of levels) {
      it(`should revert: ${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Program;\n${body}`, {
          calldata,
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(false);
        expect(bytesToHex(result.returnValue)).toBe(panic32);
        // Nothing the program wrote before it reverted stays
        expect(await result.getStorage(0n)).toBe(0n);
      });
    }
  }
}

describe("memory array bounds", () => {
  passes({
    "read the first and last elements": [
      `storage { [0] r0: uint256; [1] r2: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r0 = a[0];
  r2 = a[2];
}`,
      [1n, 3n],
    ],
    "write the first and last elements": [
      `storage { [0] r0: uint256; [1] r2: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  a[0] = 10;
  a[2] = 30;
  r0 = a[0];
  r2 = a[2];
}`,
      [10n, 30n],
    ],
    "read the last element at an index from calldata": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = a[msg.data.length - 1];
}`,
      [3n],
      "0x000000",
    ],
    "sum elements in a loop that runs exactly to the length": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3, 4];
  let sum = 0;
  for (let i = 0; i < a.length; i = i + 1) {
    a[i] = a[i] * 2;
    sum = sum + a[i];
  }
  r = sum;
}`,
      [20n],
    ],
    "index an array literal": [
      `storage { [0] r: uint256; [1] s: uint256; }
create { s = 2; }
code {
  r = [1, 2, 3][s];
}`,
      [3n],
    ],
    "read and write nested elements at the edges": [
      `storage { [0] r0: uint256; [1] r1: uint256; [2] r2: uint256; }
code {
  let m: array<array<uint256>> = [[1], [2, 3]];
  m[1][1] = 30;
  m[0][0] = 10;
  r0 = m[0][0];
  r1 = m[1][0];
  r2 = m[1][1];
}`,
      [10n, 2n, 30n],
    ],
  });

  reverts({
    "read at the length": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = a[3];
}`,
    ],
    "write at the length": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = 1;
  a[3] = 7;
}`,
    ],
    "read at an index from calldata": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = 1;
  r = a[msg.data.length];
}`,
      "0x000000",
    ],
    "write at an index from calldata": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = 1;
  a[msg.data.length] = 7;
}`,
      "0x000000",
    ],
    "read at a huge index": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  let i = 0;
  i = i - 1;
  r = a[i];
}`,
    ],
    "write at a huge index": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = 1;
  a[57896044618658097711785492504343953926634992332820282019728792003956564819968] = 7;
}`,
    ],
    "read at an index that wraps below zero": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = a[0 - 1];
}`,
    ],
    "index an array literal past its length": [
      `storage { [0] r: uint256; [1] s: uint256; }
create { s = 5; }
code {
  r = [1, 2, 3][s];
}`,
    ],
    "write at a negative index cast to uint256": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  let i: int256 = -1 as int256;
  r = 1;
  a[i as uint256] = 99;
}`,
    ],
    "read past a shorter array assigned to the variable": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  a = [4];
  r = a[1];
}`,
    ],
    "write in a loop that runs one past the length": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [0, 0, 0];
  r = 1;
  for (let i = 0; i <= a.length; i = i + 1) {
    a[i] = i;
  }
}`,
    ],
    "write past the end of an inner array": [
      `storage { [0] r: uint256; }
code {
  let m: array<array<uint256>> = [[1], [2]];
  r = 1;
  m[0][1] = 99;
}`,
    ],
    "read past the end of an inner array": [
      `storage { [0] r: uint256; }
code {
  let m: array<array<uint256>> = [[1], [2]];
  r = m[0][1];
}`,
    ],
    "read past the end of the outer array": [
      `storage { [0] r: uint256; }
code {
  let m: array<array<uint256>> = [[1], [2]];
  r = m[2][0];
}`,
    ],
    "write past the end of an array parameter": [
      `define {
  function set(xs: array<uint256>, i: uint256) -> uint256 {
    xs[i] = 1;
    return 0;
  };
}
storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = 1;
  r = set(a, 3);
}`,
    ],
  });
});

describe("memory bytes bounds", () => {
  passes({
    "read and write the first and last bytes": [
      `storage { [0] r0: uint256; [1] r2: uint256; }
code {
  let b: bytes = msg.data[0:3];
  b[0] = b[0] + 1 as uint8;
  b[2] = b[2] + 1 as uint8;
  r0 = b[0];
  r2 = b[2];
}`,
      [11n, 13n],
      "0x0a0b0c",
    ],
  });

  reverts({
    "read at the length": [
      `storage { [0] r: uint256; }
code {
  let b: bytes = msg.data[0:3];
  r = b[3];
}`,
      "0x0a0b0c",
    ],
    "write at the length": [
      `storage { [0] r: uint256; }
code {
  let b: bytes = msg.data[0:3];
  r = 1;
  b[3] = 1 as uint8;
}`,
      "0x0a0b0c",
    ],
  });
});

describe("slice bounds", () => {
  passes({
    "slice all of msg.data": [
      `storage { [0] n: uint256; [1] r: uint256; }
code {
  let b = msg.data[0:3];
  n = b.length;
  r = b[2];
}`,
      [3n, 12n],
      "0x0a0b0c",
    ],
    "slice all of memory bytes": [
      `storage { [0] n: uint256; [1] r: uint256; }
code {
  let b = msg.data[0:3];
  let c = b[1:3];
  n = c.length;
  r = c[1];
}`,
      [2n, 12n],
      "0x0a0b0c",
    ],
    "take an empty slice at the end": [
      `storage { [0] n: uint256; }
code {
  let b = msg.data[0:3];
  let c = b[3:3];
  n = c.length + 1;
}`,
      [1n],
      "0x0a0b0c",
    ],
  });

  reverts({
    "slice msg.data past its end": [
      `storage { [0] r: uint256; }
code {
  let b = msg.data[0:4];
  r = b.length;
}`,
      "0x0a0b0c",
    ],
    "slice memory bytes past their end": [
      `storage { [0] r: uint256; }
code {
  let b = msg.data[0:3];
  let c = b[1:4];
  r = c.length;
}`,
      "0x0a0b0c",
    ],
    "slice with the start after the end": [
      `storage { [0] r: uint256; }
code {
  let b = msg.data[0:3];
  let c = b[2:1];
  r = c.length;
}`,
      "0x0a0b0c",
    ],
  });
});

describe("storage array bounds", () => {
  passes({
    "read and write the first and last elements of a fixed array": [
      `storage { [0] r0: uint256; [1] r2: uint256; [2] f: array<uint256, 3>; }
code {
  f[0] = 10;
  f[2] = 30;
  r0 = f[0];
  r2 = f[2];
}`,
      [10n, 30n],
    ],
  });

  reverts({
    "write a fixed array at its length": [
      `storage { [0] r: uint256; [1] f: array<uint256, 3>; }
code {
  r = 1;
  f[3] = 7;
}`,
    ],
    "write a fixed array at an index that wraps below zero": [
      `storage { [0] r: uint256; [1] f: array<uint256, 3>; }
code {
  r = 1;
  f[0 - 1] = 7;
}`,
    ],
    "read a fixed array at an index from calldata": [
      `storage { [0] r: uint256; [1] f: array<uint256, 3>; }
code {
  r = 1;
  r = f[msg.data.length];
}`,
      "0x000000",
    ],
  });
});

describe("bounds check debug info", () => {
  const source = `name Program;
storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = a[msg.data.length];
}`;
  const access = "a[msg.data.length]";

  for (const level of levels) {
    it(`should mark the revert with its panic (level ${level})`, async () => {
      const result = await compile({
        to: "bytecode",
        source,
        optimizer: { level },
      });
      if (!result.success) throw new Error("compile failed");

      const reverts = result.value.bytecode.runtimeProgram.instructions.filter(
        (instruction) => instruction.operation?.mnemonic === "REVERT",
      );
      expect(reverts).toHaveLength(1);

      const context = reverts[0].context as Record<string, unknown>;
      expect(context.revert).toEqual({
        panic: 0x32,
        reason: {
          pointer: { location: "memory", offset: 0x1c, length: 0x24 },
        },
      });
      expect(context.code).toMatchObject({
        range: { offset: source.indexOf(access), length: access.length },
      });
    });
  }
});
