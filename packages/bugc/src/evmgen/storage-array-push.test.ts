/**
 * `push` on a dynamic array in storage, as in Solidity: `a.push(v)`
 * writes `v` at index `a.length`, then adds one to the length;
 * `a.push()` adds a zero element. An index at or past the length
 * reverts with Panic(0x32), for reads and writes, as in memory.
 */
import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex } from "ethereum-cryptography/utils";
import { dereference } from "@ethdebug/pointers";
import type * as Format from "@ethdebug/format";

import { compile } from "#compiler";
import { executeProgram } from "#test/evm/behavioral";
import { createMachineState } from "@ethdebug/evm";
import { traceLocals } from "#test/evm/locals";

const levels = [0, 1, 2, 3] as const;

const panic32 = "4e487b71" + 0x32n.toString(16).padStart(64, "0");

function word(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[31 - i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

/** keccak256 of words, as a dynamic array's first slot */
function hashed(...values: bigint[]): bigint {
  const data = new Uint8Array(32 * values.length);
  values.forEach((value, i) => data.set(word(value), 32 * i));
  return BigInt("0x" + bytesToHex(keccak256(data)));
}

const passes: Record<string, [string, [bigint, bigint][]]> = {
  "push values and read them back": [
    `storage { [0] h: array<uint256>; [1] r: uint256; }
code { h.push(5); h.push(7); r = h[1] + h.length; }`,
    [
      [0n, 2n],
      [hashed(0n), 5n],
      [hashed(0n) + 1n, 7n],
      [1n, 9n],
    ],
  ],
  "push narrow elements into one slot": [
    `storage { [0] h: array<uint8>; }
code { h.push(1); h.push(2); }`,
    [
      [0n, 2n],
      [hashed(0n), 0x0201n],
    ],
  ],
  "push an empty element, then into it": [
    `storage { [0] m: array<array<uint256>>; [1] r: uint256; }
code { m.push(); m[0].push(4); r = m[0][0] + m.length + m[0].length; }`,
    [
      [0n, 1n],
      [hashed(0n), 1n],
      [hashed(hashed(0n)), 4n],
      [1n, 6n],
    ],
  ],
  "push into a mapping's array": [
    `storage { [0] q: mapping<uint256, array<uint256>>; [1] r: uint256; }
code { q[3].push(9); r = q[3][0]; }`,
    [
      [hashed(3n, 0n), 1n],
      [hashed(hashed(3n, 0n)), 9n],
      [1n, 9n],
    ],
  ],
  "push into a struct's array": [
    `define { struct S { n: uint8; xs: array<uint256>; }; }
storage { [0] s: S; [2] r: uint256; }
code { s.n = 1; s.xs.push(6); r = s.xs[0]; }`,
    [
      [0n, 1n],
      [1n, 1n],
      [hashed(1n), 6n],
      [2n, 6n],
    ],
  ],
  "write an element below the length": [
    `storage { [0] h: array<uint256>; }
code { h.push(1); h.push(2); h[1] = 3; }`,
    [[hashed(0n) + 1n, 3n]],
  ],
};

const reverts: Record<string, string> = {
  "write at the length": `storage { [0] h: array<uint256>; }
code { h.push(1); h[1] = 2; }`,
  "read an empty array": `storage { [0] h: array<uint256>; [1] r: uint256; }
code { r = h[0]; }`,
  "write into an empty inner array": `storage { [0] m: array<array<uint256>>; }
code { m.push(); m[0][0] = 1; }`,
};

describe("push on a storage array", () => {
  for (const [name, [body, slots]] of Object.entries(passes)) {
    for (const level of levels) {
      it(`should ${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Push;\n${body}`, {
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

  for (const [name, body] of Object.entries(reverts)) {
    for (const level of levels) {
      it(`should revert: ${name} (level ${level})`, async () => {
        const result = await executeProgram(`name Push;\n${body}`, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(false);
        expect(bytesToHex(result.returnValue)).toBe(panic32);
      });
    }
  }

  it("gives the pushed elements to the array's pointer", async () => {
    const { program, executor } = await traceLocals(
      `name Push;\nstorage { [0] h: array<uint16>; }
code { h.push(5); h.push(7); h.push(9); }`,
    );
    // the storage after the transaction
    const state = createMachineState(await executor.currentState());
    const variable = (
      program.context as Format.Program.Context.Variables
    ).variables.find((v) => v.identifier === "h")!;
    const cursor = await dereference(variable.pointer!, { state });
    const view = await cursor.view(state);
    const read = await Promise.all(
      view.regions
        .filter((region) => region.name === "element")
        .map(async (region) => (await view.read(region)).asUint()),
    );
    expect(read).toEqual([5n, 7n, 9n]);
  });
});

describe("push type errors", () => {
  const errors: Record<string, string> = {
    "push on a fixed-size array": `storage { [0] f: array<uint256, 3>; }
code { f.push(1); }`,
    "push on a memory array": `code { let a: array<uint256> = [1, 2]; a.push(3); }`,
    "push a value of the wrong type": `storage { [0] h: array<uint8>; }
code { h.push(true); }`,
    "push two values": `storage { [0] h: array<uint256>; }
code { h.push(1, 2); }`,
  };
  for (const [name, body] of Object.entries(errors)) {
    it(`rejects ${name}`, async () => {
      const result = await compile({
        to: "bytecode",
        source: `name Push;\n${body}`,
      });
      expect(result.success).toBe(false);
    });
  }
});
