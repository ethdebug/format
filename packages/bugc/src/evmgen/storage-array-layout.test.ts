/**
 * Storage arrays have Solidity's layout. A fixed-size array is inline:
 * its elements start at its own slot. A dynamic array keeps its length
 * in its slot and its elements from keccak256(slot). Either way, an
 * element narrower than 16 bytes shares a slot with its neighbors, as
 * many as fit, from the low-order end; any other element starts a slot
 * of its own and takes as many slots as its type needs. An array, as a
 * struct member, starts a slot, and the next member starts the slot
 * after it. Each storage variable's pointer must read the values the
 * program wrote.
 */
import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex } from "ethereum-cryptography/utils";
import { createMachineState } from "@ethdebug/evm";
import { dereference } from "@ethdebug/pointers";
import type * as Format from "@ethdebug/format";

import { executeProgram } from "#test/evm/behavioral";
import { traceLocals } from "#test/evm/locals";

const levels = [0, 1, 2, 3] as const;

/** keccak256 of a slot number, as a dynamic array's first slot */
function hashed(slot: bigint): bigint {
  const word = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    word[31 - i] = Number((slot >> BigInt(8 * i)) & 0xffn);
  }
  return BigInt("0x" + bytesToHex(keccak256(word)));
}

interface Case {
  source: string;
  /** Expected words, by slot */
  slots: [bigint, bigint][];
  /** Expected values, in order, of each variable's regions, by name */
  pointers?: Record<string, Record<string, bigint[]>>;
}

const cases: Record<string, Case> = {
  "a fixed-size array is inline": {
    source: `storage {
  [0] f: array<uint256, 3>;
  [3] r: uint256;
}
code { f[0] = 10; f[2] = 30; r = f[0] + f[2]; }`,
    slots: [
      [0n, 10n],
      [1n, 0n],
      [2n, 30n],
      [3n, 40n],
    ],
    pointers: { f: { element: [10n, 0n, 30n] } },
  },
  "narrow elements share a slot, from the low-order end": {
    source: `storage {
  [0] a: array<uint8, 40>;
  [2] r: uint256;
}
code { a[0] = 1; a[1] = 2; a[33] = 7; r = (a[1] as uint256) + (a[33] as uint256); }`,
    slots: [
      [0n, 0x0201n],
      [1n, 0x0700n],
      [2n, 9n],
    ],
    pointers: {
      a: {
        element: Array.from({ length: 40 }, (_, i) =>
          i === 0 ? 1n : i === 1 ? 2n : i === 33 ? 7n : 0n,
        ),
      },
    },
  },
  "a fixed-size array of fixed-size arrays": {
    source: `storage {
  [0] m: array<array<uint256, 3>, 2>;
  [6] r: uint256;
}
code { m[0][1] = 4; m[1][2] = 5; r = m[1][2]; }`,
    slots: [
      [1n, 4n],
      [5n, 5n],
      [6n, 5n],
    ],
    pointers: { m: { element: [0n, 4n, 0n, 0n, 0n, 5n] } },
  },
  "an array in a struct takes its slots": {
    source: `define {
  struct S { x: uint8; arr: array<uint256, 2>; y: uint8; };
}
storage {
  [0] s: S;
  [4] r: uint256;
}
code { s.x = 1; s.arr[1] = 2; s.y = 3; r = s.arr[1] + (s.y as uint256); }`,
    slots: [
      [0n, 1n],
      [1n, 0n],
      [2n, 2n],
      [3n, 3n],
      [4n, 5n],
    ],
    pointers: { s: { x: [1n], "arr-element": [0n, 2n], y: [3n] } },
  },
  "a fixed-size array of structs": {
    source: `define {
  struct P { a: uint256; b: uint256; };
}
storage {
  [0] ps: array<P, 2>;
  [4] r: uint256;
}
code { ps[1].a = 6; ps[1].b = 7; ps[0].b = 8; r = ps[1].b; }`,
    slots: [
      [1n, 8n],
      [2n, 6n],
      [3n, 7n],
      [4n, 7n],
    ],
    pointers: { ps: { a: [0n, 6n], b: [8n, 7n] } },
  },
  "a dynamic array's narrow elements share a slot": {
    source: `storage {
  [0] d: array<uint16>;
  [1] r: uint256;
}
code { d[0] = 3; d[1] = 5; r = d[1] as uint256; }`,
    slots: [
      [hashed(0n), 0x00050003n],
      [1n, 5n],
    ],
  },
};

describe("storage array layout", () => {
  for (const [name, { source, slots }] of Object.entries(cases)) {
    for (const level of levels) {
      it(`${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Layout;\n${source}`, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        for (const [slot, value] of slots) {
          expect(await result.getStorage(slot), `slot ${slot}`).toBe(value);
        }
      });
    }
  }
});

describe("storage array pointers", () => {
  for (const [name, { source, pointers }] of Object.entries(cases)) {
    if (!pointers) continue;
    it(name, async () => {
      const { program, executor, steps } = await traceLocals(
        `name Layout;\n${source}`,
      );
      const state = createMachineState(executor, {
        traceStep: steps[steps.length - 1],
      });
      for (const [identifier, regions] of Object.entries(pointers)) {
        const variable = (
          program.context as Format.Program.Context.Variables
        ).variables.find((v) => v.identifier === identifier)!;
        const cursor = await dereference(variable.pointer!, { state });
        const view = await cursor.view(state);
        for (const [regionName, values] of Object.entries(regions)) {
          const read = await Promise.all(
            view.regions
              .filter((region) => region.name === regionName)
              .map(async (region) => (await view.read(region)).asUint()),
          );
          expect(read, `${identifier}: ${regionName}`).toEqual(values);
        }
      }
    });
  }
});
