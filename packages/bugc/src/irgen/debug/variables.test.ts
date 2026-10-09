/**
 * A storage string or `bytes` has Solidity's encoding: up to 31 bytes
 * in its slot, left-aligned, with length * 2 in the low byte; else
 * length * 2 + 1 in the slot and the data from keccak256(slot). Its
 * pointer must say so, so that a debugger reads the exact bytes from
 * the pointer alone.
 */
import { describe, it, expect } from "vitest";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { Executor, createMachineState } from "@ethdebug/evm";
import { dereference } from "@ethdebug/pointers";
import * as Format from "@ethdebug/format";

import { compile } from "#compiler";
import { traceLocals } from "#test/evm/locals";

const lengths = [0, 5, 31, 32, 70];
const levels = [0, 1, 2, 3] as const;

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const text = (length: number) =>
  Array.from({ length }, (_, i) => alphabet[i % alphabet.length]).join("");

const hex = (length: number) =>
  Array.from({ length }, (_, i) => (i + 1).toString(16).padStart(2, "0")).join(
    "",
  );

const source = (length: number) => `name StringPointers;
define { struct S { id: uint256; name: string; tag: bytes; }; }
storage {
  [0] s: string;
  [1] b: bytes;
  [2] p: S;
  [5] a: array<string, 2>;
  [7] u: mapping<uint256, S>;
}
code {
  let m: string = "${text(length)}";
  let n: bytes = 0x${hex(70)};
  let c: bytes = ${length === 70 ? "n" : `n[0:${length}]`};
  s = m;
  b = c;
  p.id = 1;
  p.name = m;
  p.tag = c;
  a[1] = m;
  u[7].id = 2;
  u[7].name = m;
  u[7].tag = c;
}`;

/**
 * The pointer to an entry of a mapping, from the entry template that a
 * pointer defines (with the mapping's slot and the key)
 */
function entryOf(
  pointer: Format.Pointer,
  template: string,
  define: Record<string, Format.Pointer.Expression>,
): Format.Pointer {
  if (!Format.Pointer.Collection.isTemplates(pointer)) {
    throw new Error("pointer defines no templates");
  }
  return {
    templates: pointer.templates,
    in: { define, in: { template } },
  };
}

/** Read each region named `name`, in order, as hex */
async function readRegions(
  pointer: Format.Pointer,
  state: ReturnType<typeof createMachineState>,
  name: string,
): Promise<string[]> {
  const cursor = await dereference(pointer, { state });
  const view = await cursor.view(state);
  return Promise.all(
    view.regions
      .filter((region) => region.name === name)
      .map(async (region) => bytesToHex(await view.read(region))),
  );
}

describe("storage string and bytes pointers", () => {
  for (const level of levels) {
    for (const length of lengths) {
      it(`read ${length} bytes (level ${level})`, async () => {
        const program = source(length);
        const run = await traceLocals(program, level);
        const state = run.stateAt(run.steps.length - 1);
        const pointerOf = (identifier: string) =>
          (
            run.program.context as Format.Program.Context.Variables
          ).variables.find((v) => v.identifier === identifier)!.pointer!;

        const string = bytesToHex(new TextEncoder().encode(text(length)));
        const bytes = bytesToHex(hexToBytes(hex(length)));

        expect(await readRegions(pointerOf("s"), state, "data")).toEqual([
          string,
        ]);
        expect(await readRegions(pointerOf("b"), state, "data")).toEqual([
          bytes,
        ]);
        expect(await readRegions(pointerOf("p"), state, "id")).toEqual([
          "0".repeat(63) + "1",
        ]);
        expect(await readRegions(pointerOf("p"), state, "name-data")).toEqual([
          string,
        ]);
        expect(await readRegions(pointerOf("p"), state, "tag-data")).toEqual([
          bytes,
        ]);
        expect(await readRegions(pointerOf("a"), state, "data")).toEqual([
          "",
          string,
        ]);

        // A mapping's entry `u[7]` comes from its entry template
        const entry = entryOf(pointerOf("u"), "entry", { slot: 7, key: 7 });
        expect(await readRegions(entry, state, "value-id")).toEqual([
          "0".repeat(63) + "2",
        ]);
        expect(await readRegions(entry, state, "value-name-data")).toEqual([
          string,
        ]);
        expect(await readRegions(entry, state, "value-tag-data")).toEqual([
          bytes,
        ]);
      });
    }
  }
});

/**
 * A mapping's entry is at keccak256(key . slot). Its pointer must give a
 * template for the entry, so that a debugger finds `players[k]` and its
 * members, for any key, from the pointer alone.
 */
describe("storage mapping pointers", () => {
  const program = `name MappingPointers;
define { struct Player { score: uint64; combo: uint32; name: string; }; }
storage {
  [0] other: uint256;
  [4] players: mapping<address, Player>;
  [5] plays: mapping<address, uint256>;
  [6] grid: mapping<address, mapping<uint256, uint8>>;
}
code {
  let who = msg.data[0:32] as bytes32 as address;
  let len = msg.data[32:64] as bytes32 as uint256;
  players[who].score = len as uint64;
  players[who].combo = 3;
  players[who].name = msg.data[64:64 + len] as string;
  plays[who] = plays[who] + 1;
  grid[who][len] = 7;
}`;

  const players = [
    { key: "0x" + "a11ce".padStart(40, "0"), name: "alice" },
    { key: "0x" + "b0b".padStart(40, "0"), name: "bob" },
    {
      key: "0x" + "ca201".padStart(40, "0"),
      name: "carol, the unstoppable combo queen",
    },
  ];

  const word = (value: bigint | number) =>
    BigInt(value).toString(16).padStart(64, "0");

  for (const level of levels) {
    it(`reads alice's, bob's and carol's entries (level ${level})`, async () => {
      const result = await compile({
        to: "bytecode",
        source: program,
        optimizer: { level },
      });
      if (!result.success) throw new Error("compile failed");
      const { bytecode } = result.value;
      const executor = new Executor();
      await executor.deploy(bytesToHex(bytecode.create ?? bytecode.runtime));
      for (const { key, name } of players) {
        const text = new TextEncoder().encode(name);
        const data = word(BigInt(key)) + word(text.length) + bytesToHex(text);
        const run = await executor.execute({ data });
        expect(run.success).toBe(true);
      }
      const state = createMachineState(await executor.currentState());
      const pointerOf = (identifier: string) =>
        (
          bytecode.runtimeProgram.context as Format.Program.Context.Variables
        ).variables.find((v) => v.identifier === identifier)!.pointer!;

      for (const { key, name } of players) {
        const text = new TextEncoder().encode(name);
        const player = entryOf(pointerOf("players"), "entry", {
          slot: 4,
          key,
        });
        expect(await readRegions(player, state, "value-score")).toEqual([
          word(text.length).slice(-16),
        ]);
        expect(await readRegions(player, state, "value-combo")).toEqual([
          "00000003",
        ]);
        expect(await readRegions(player, state, "value-name-data")).toEqual([
          bytesToHex(text),
        ]);

        const plays = entryOf(pointerOf("plays"), "entry", { slot: 5, key });
        expect(await readRegions(plays, state, "value")).toEqual([word(1)]);

        // `grid[key]` is a mapping: its slot is the inner mapping's,
        // and the inner template gives `grid[key][len]`
        const grid = entryOf(pointerOf("grid"), "entry", { slot: 6, key });
        const cursor = await dereference(grid, { state });
        const [inner] = (await cursor.view(state)).regions;
        expect(inner.name).toEqual("value");
        if (!("slot" in inner)) throw new Error("not a storage region");
        const cell = entryOf(pointerOf("grid"), "value-entry", {
          slot: inner.slot.toHex(),
          key: text.length,
        });
        expect(await readRegions(cell, state, "value")).toEqual(["07"]);
      }
    });
  }
});
