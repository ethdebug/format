import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

const word = 2n ** 256n;

// Each program writes its results to storage slots 0, 1, ...; it is
// called with the calldata given, if any
type Programs = Record<string, [string, bigint[], string?]>;

function run(programs: Programs) {
  for (const [name, [body, expected, calldata = ""]] of Object.entries(
    programs,
  )) {
    for (const level of [0, 1, 2, 3] as const) {
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

describe("common subexpressions", () => {
  run({
    "cast the same sum twice": [
      `storage { [0] n: uint256; [1] y: uint8; [2] z: uint8; }
code {
  n = 4;
  let m = n;
  let a = (m + 1) as uint8;
  let b = (m + 1) as uint8;
  y = a;
  z = b;
}`,
      [4n, 5n, 5n],
    ],
  });
});

describe("memory arrays", () => {
  run({
    "read two elements in one expression": [
      `storage { [0] r: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = a[0] + a[2];
}`,
      [4n],
    ],
    "take the length of an array literal": [
      `storage { [0] r: uint256; [1] s: uint256; }
create { s = 2; }
code {
  r = [1, 2, 3].length;
  s = [1, 2, 3][s];
}`,
      [3n, 3n],
    ],
    "read nested elements": [
      `storage { [0] r: uint256; [1] s: uint256; [2] n: uint256; }
code {
  let m: array<array<uint256>> = [[1, 2], [3, 4, 5]];
  r = m[1][2];
  s = m[0][1];
  n = m[1].length;
}`,
      [5n, 2n, 3n],
    ],
    "write a uint256 element": [
      `storage { [0] r: uint256; [1] s: uint256; [2] n: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  a[1] = 7;
  r = a[1];
  s = a[2];
  n = a.length;
}`,
      [7n, 3n, 3n],
    ],
    "write uint256 elements in a loop": [
      `storage { [0] r0: uint256; [1] r1: uint256; [2] r2: uint256; }
code {
  let a: array<uint256> = [0, 0, 0];
  for (let i = 0; i < a.length; i = i + 1) {
    a[i] = i * 10 + 1;
  }
  r0 = a[0];
  r1 = a[1];
  r2 = a[2];
}`,
      [1n, 11n, 21n],
    ],
    "write string elements": [
      `storage { [0] l0: uint256; [1] l1: uint256; }
code {
  let names: array<string> = ["a", "bb"];
  names[0] = "xyz";
  names[1] = names[0];
  l0 = names[0].length;
  l1 = names[1].length;
}`,
      [3n, 3n],
    ],
    "write nested elements": [
      `storage {
  [0] r0: uint256; [1] r1: uint256; [2] r2: uint256; [3] r3: uint256;
}
code {
  let m: array<array<uint256>> = [[1, 2], [3, 4, 5]];
  m[1][2] = 50;
  m[0][0] = 10;
  for (let i = 0; i < 2; i = i + 1) {
    m[i][1] = m[i][1] + 100;
  }
  r0 = m[0][0];
  r1 = m[0][1];
  r2 = m[1][1];
  r3 = m[1][2];
}`,
      [10n, 102n, 104n, 50n],
    ],
    "write an inner array": [
      `storage { [0] r: uint256; [1] n: uint256; }
code {
  let m: array<array<uint256>> = [[1, 2], [3, 4, 5]];
  let row: array<uint256> = [6, 7, 8, 9];
  m[0] = row;
  row[3] = 90;
  r = m[0][3];
  n = m[0].length;
}`,
      [90n, 4n],
    ],
    "write elements of other types": [
      `storage { [0] r0: uint8; [1] r1: address; [2] r2: bool; [3] r3: int256; }
code {
  let a: array<uint8> = [1 as uint8, 2 as uint8];
  let b: array<address> = [msg.sender, msg.sender];
  let c: array<bool> = [false, false];
  let d: array<int256> = [0 as int256, 0 as int256];
  a[1] = 200 as uint8;
  b[0] = 0x1234567890123456789012345678901234567890;
  c[1] = true;
  d[0] = -5 as int256;
  r0 = a[1];
  r1 = b[0];
  r2 = c[1];
  r3 = d[0];
}`,
      [200n, 0x1234567890123456789012345678901234567890n, 1n, word - 5n],
    ],
    "write elements of an array parameter": [
      `define {
  function fill(xs: array<uint256>, v: uint256) -> uint256 {
    for (let i = 0; i < xs.length; i = i + 1) {
      xs[i] = v + i;
    }
    return xs[1];
  };
}
storage { [0] r: uint256; [1] s: uint256; [2] t: uint256; }
code {
  let a: array<uint256> = [1, 2, 3];
  r = fill(a, 40);
  s = a[0];
  t = a[2];
}`,
      [41n, 40n, 42n],
    ],
  });
});

describe("memory bytes", () => {
  // `msg.data` sliced and copied into memory
  run({
    "read bytes": [
      `storage { [0] r0: uint256; [1] r2: uint256; [2] n: uint256; }
code {
  let b: bytes = msg.data[0:3];
  r0 = b[0];
  r2 = b[2];
  n = b.length;
}`,
      [10n, 12n, 3n],
      "0x0a0b0c",
    ],
    "write a byte": [
      `storage {
  [0] r0: uint256; [1] r1: uint256; [2] r2: uint256; [3] n: uint256;
}
code {
  let b: bytes = msg.data[0:3];
  b[1] = 200 as uint8;
  r0 = b[0];
  r1 = b[1];
  r2 = b[2];
  n = b.length;
}`,
      [10n, 200n, 12n, 3n],
      "0x0a0b0c",
    ],
    "write bytes in a loop": [
      `storage {
  [0] r0: uint256; [1] r1: uint256; [2] r2: uint256; [3] n: uint256;
}
code {
  let b: bytes = msg.data[0:3];
  for (let i = 0 as uint8; i < 3 as uint8; i = i + 1 as uint8) {
    b[i] = b[i] + 1 as uint8;
  }
  r0 = b[0];
  r1 = b[1];
  r2 = b[2];
  n = b.length;
}`,
      [11n, 12n, 13n, 3n],
      "0x0a0b0c",
    ],
  });
});
