import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

// Each program writes its results to storage slots 0, 1, ...
type Programs = Record<string, [string, bigint[]]>;

function run(programs: Programs) {
  for (const [name, [body, expected]] of Object.entries(programs)) {
    for (const level of [0, 1, 2, 3] as const) {
      it(`should ${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Program;\n${body}`, {
          calldata: "",
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
  });
});
