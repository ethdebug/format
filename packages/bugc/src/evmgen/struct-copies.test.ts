import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import {
  executeProgram,
  type ExecuteProgramResult,
} from "#test/evm/behavioral";

const levels = [0, 1, 2, 3] as const;

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const text = (length: number, from: number = 0) =>
  Array.from({ length }, (_, i) => alphabet[(i + from) % alphabet.length]).join(
    "",
  );

const word = (n: bigint) => hexToBytes(n.toString(16).padStart(64, "0"));
const hash = (bytes: Uint8Array) => BigInt("0x" + bytesToHex(keccak256(bytes)));

/** The slot of a mapping's value: keccak256(key . slot) */
const mappingSlot = (slot: bigint, key: bigint) =>
  hash(new Uint8Array([...word(key), ...word(slot)]));

/** The sender of every transaction the executor sends */
const sender = 1n;

/**
 * Check that storage at `slot` holds `data` as Solidity encodes a
 * string: up to 31 bytes in the slot itself, left-aligned, with
 * length * 2 in the low byte; else length * 2 + 1 in the slot and the
 * data from keccak256(slot).
 */
async function expectEncoded(
  result: ExecuteProgramResult,
  slot: bigint,
  value: string,
) {
  const data = new TextEncoder().encode(value);
  const length = BigInt(data.length);
  const padded = new Uint8Array(Math.ceil(data.length / 32) * 32);
  padded.set(data);
  const dataWord = (i: number) =>
    BigInt("0x" + (bytesToHex(padded.slice(i * 32, i * 32 + 32)) || "0"));

  if (length < 32n) {
    expect(await result.getStorage(slot)).toBe(dataWord(0) | (length * 2n));
    return;
  }

  expect(await result.getStorage(slot)).toBe(length * 2n + 1n);
  const base = hash(word(slot));
  for (let i = 0; i < padded.length / 32; i++) {
    expect(await result.getStorage(base + BigInt(i))).toBe(dataWord(i));
  }
}

/**
 * The words of storage a `Player` at `base` may use: its own slots, and
 * the first data slots of a string in any of them
 */
async function playerStorage(
  result: ExecuteProgramResult,
  base: bigint,
): Promise<bigint[]> {
  const slots: bigint[] = [];
  for (let i = 0n; i < 7n; i++) {
    slots.push(base + i);
    const data = hash(word(base + i));
    for (let j = 0n; j < 4n; j++) slots.push(data + j);
  }
  return Promise.all(slots.map((slot) => result.getStorage(slot)));
}

const define = `define {
  struct Stats { best: uint32; label: string; };
  struct Player {
    score: uint64;
    combo: uint32;
    plays: uint32;
    name: string;
    lastBlock: uint64;
    stats: Stats;
    tag: string;
    hits: uint8;
  };
}
storage {
  [0] total: uint128;
  [4] players: mapping<address, Player>;
}`;

/** Set every field of the sender's `Player`, with a name of `name` */
const create = (name: string) => `create {
  players[msg.sender].score = 100;
  players[msg.sender].combo = 3;
  players[msg.sender].plays = 7;
  players[msg.sender].name = "${name}";
  players[msg.sender].lastBlock = 9;
  players[msg.sender].stats.best = 5;
  players[msg.sender].stats.label = "${text(40, 7)}";
  players[msg.sender].tag = "${text(5, 3)}";
  players[msg.sender].hits = 2;
}`;

describe("copying a struct from storage to memory and back", () => {
  // The name's length before and after. A name that needs fewer data
  // words than before has the words it no longer uses cleared.
  const changes: Array<[number, number]> = [
    [70, 70],
    [70, 5],
    [5, 70],
    [40, 32],
    [0, 31],
    [31, 0],
  ];

  for (const level of levels) {
    for (const [from, to] of changes) {
      it(`writes back every field, name ${from} to ${to} bytes (level ${level})`, async () => {
        const before = text(from);
        const after = from === to ? before : text(to, 11);
        const rename = from === to ? "" : `player.name = "${after}";`;

        const roundTrip = await executeProgram(
          `name RoundTrip;
${define}
${create(before)}
code {
  let player: Player = players[msg.sender];
  player.plays = player.plays + 1;
  player.score = player.score + 10;
  player.stats.best = player.stats.best + player.combo;
  ${rename}
  players[msg.sender] = player;
}`,
          { calldata: "", optimizationLevel: level },
        );
        expect(roundTrip.callSuccess).toBe(true);

        // The same changes, written field by field
        const direct = await executeProgram(
          `name Direct;
${define}
${create(before)}
code {
  players[msg.sender].plays = 8;
  players[msg.sender].score = 110;
  players[msg.sender].stats.best = 8;
  players[msg.sender].name = "${after}";
}`,
          { calldata: "", optimizationLevel: level },
        );
        expect(direct.callSuccess).toBe(true);

        const base = mappingSlot(4n, sender);
        expect(await playerStorage(roundTrip, base)).toEqual(
          await playerStorage(direct, base),
        );

        // score (8 bytes), combo (4), plays (4), from the low-order end
        expect(await roundTrip.getStorage(base)).toBe(
          110n | (3n << 64n) | (8n << 96n),
        );
        await expectEncoded(roundTrip, base + 1n, after);
        expect(await roundTrip.getStorage(base + 2n)).toBe(9n);
        expect(await roundTrip.getStorage(base + 3n)).toBe(8n);
        await expectEncoded(roundTrip, base + 4n, text(40, 7));
        await expectEncoded(roundTrip, base + 5n, text(5, 3));
        expect(await roundTrip.getStorage(base + 6n)).toBe(2n);
      });
    }
  }
});

describe("copying a struct between storage variables", () => {
  for (const level of levels) {
    it(`copies through a local (level ${level})`, async () => {
      const result = await executeProgram(
        `name Copy;
define { struct Entry { id: uint32; note: string; owner: address; }; }
storage { [0] a: Entry; [3] b: Entry; }
create {
  a.id = 4;
  a.note = "${text(50)}";
  a.owner = 0x00000000000000000000000000000000000000aa;
  b.note = "${text(90, 5)}";
}
code {
  let e: Entry = a;
  e.id = e.id + 1;
  b = e;
}`,
        { calldata: "", optimizationLevel: level },
      );
      expect(result.callSuccess).toBe(true);

      expect(await result.getStorage(3n)).toBe(5n);
      await expectEncoded(result, 4n, text(50));
      expect(await result.getStorage(5n)).toBe(0xaan);
      // b's old note took three data words; the third is cleared
      expect(await result.getStorage(hash(word(4n)) + 2n)).toBe(0n);
      // a is unchanged
      expect(await result.getStorage(0n)).toBe(4n);
      await expectEncoded(result, 1n, text(50));
    });
  }
});

describe("copying a storage string to memory", () => {
  for (const level of levels) {
    for (const length of [0, 5, 31, 32, 70]) {
      it(`copies ${length} bytes (level ${level})`, async () => {
        const value = text(length);
        const result = await executeProgram(
          `name StringCopy;
storage { [1] motd: string; [2] other: string; [3] size: uint256; }
create { motd = "${value}"; }
code {
  let m: string = motd;
  size = m.length;
  other = m;
}`,
          { calldata: "", optimizationLevel: level },
        );
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(3n)).toBe(BigInt(length));
        await expectEncoded(result, 2n, value);
      });
    }
  }
});
