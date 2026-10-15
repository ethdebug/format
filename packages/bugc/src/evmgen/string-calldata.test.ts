import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";

import { compile } from "#compiler";

import { executeProgram } from "#test/evm/behavioral";
import {
  expectEncoded,
  hash,
  mappingSlot,
  text,
  word as storageWord,
} from "#test/evm/storage";

const levels = [0, 1, 2, 3] as const;

/** The sender of every transaction the executor sends */
const sender = 1n;

const word = (n: bigint) => n.toString(16).padStart(64, "0");

/** Calldata for `setName(string)`, ABI-encoded, without the 0x */
function setName(name: string): string {
  const data = Buffer.from(name).toString("hex");
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  return "deadbeef" + word(32n) + word(BigInt(name.length)) + padded;
}

/**
 * A `string calldata` local from the ABI offset and length words of a
 * string argument, copied to storage (a variable and a struct field)
 * and to memory
 */
const source = `name Names;
define { struct Player { score: uint256; name: string; }; }
storage {
  [0] motd: string; [1] len: uint256; [2] players: mapping<address, Player>;
  [3] copy: string; [4] raw: bytes; [5] first: uint256; [6] h: bytes32;
  [7] other: string;
}
code {
  let offset = msg.data[4:36] as bytes32 as uint256;
  let n = msg.data[4 + offset:36 + offset] as bytes32 as uint256;
  let name: string calldata =
    msg.data[36 + offset:36 + offset + n] as string calldata;
  let alias = name;
  len = alias.length;
  motd = name;
  players[msg.sender].name = name;
  let m = name as string;
  copy = m;
  let s: string = name;
  other = s;
  raw = name as bytes;
  let b = name as bytes calldata;
  if (b.length > 0) { first = b[0]; }
  h = keccak256(name);
}`;

const lengths = [0, 31, 32, 33, 65];

describe.each(levels)("a string in calldata at O%i", (level) => {
  it.each(lengths)("copies %i bytes to storage and memory", async (length) => {
    const name = text(length);
    const result = await executeProgram(source, {
      calldata: setName(name),
      optimizationLevel: level,
    });
    expect(result.callSuccess).toBe(true);
    expect(await result.getStorage(1n)).toBe(BigInt(length));
    await expectEncoded(result, 0n, name);
    await expectEncoded(result, mappingSlot(2n, sender) + 1n, name);
    await expectEncoded(result, 3n, name);
    await expectEncoded(result, 4n, name);
    await expectEncoded(result, 7n, name);
    expect(await result.getStorage(5n)).toBe(
      length > 0 ? BigInt(name.charCodeAt(0)) : 0n,
    );
    expect(await result.getStorage(6n)).toBe(
      BigInt("0x" + Buffer.from(keccak256(Buffer.from(name))).toString("hex")),
    );
  });
});

describe.each(levels)("a push from calldata at O%i", (level) => {
  for (const [type, memory] of [
    ["string calldata", "string"],
    ["bytes calldata", "bytes"],
  ]) {
    it.each(lengths)(`pushes ${type} of %i bytes`, async (length) => {
      const name = text(length);
      const result = await executeProgram(
        `name Push;
storage { [0] items: array<${memory}>; }
code {
  let offset = msg.data[4:36] as bytes32 as uint256;
  let n = msg.data[4 + offset:36 + offset] as bytes32 as uint256;
  let c: ${type} = msg.data[36 + offset:36 + offset + n] as ${type};
  items.push(c);
  items.push(c);
}`,
        { calldata: setName(name), optimizationLevel: level },
      );
      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(2n);
      const base = hash(storageWord(0n));
      await expectEncoded(result, base, name);
      await expectEncoded(result, base + 1n, name);
    });
  }
});

/**
 * A `string calldata` or `bytes calldata` parameter: the argument
 * passes as its word of offset and length, with no copy. `record` is a
 * leaf, so it is inlined at O2 and O3; `join` has two returns, so it
 * stays a real call, and passes its parameter on.
 */
const parameterSource = (callee: "record" | "join") => `name Join;
define {
  struct Player { score: uint256; name: string; };
  function record(name: string calldata, raw: bytes calldata) -> uint256 {
    players[msg.sender].name = name;
    if (raw.length > 0) { first = raw[0]; }
    return name.length;
  };
  function join(name: string calldata) -> uint256 {
    let n = record(name, name as bytes calldata);
    motd = name;
    if (n > 0) { return n; }
    return 0;
  };
}
storage {
  [0] motd: string; [1] len: uint256; [2] players: mapping<address, Player>;
  [3] first: uint256;
}
code {
  let offset = msg.data[4:36] as bytes32 as uint256;
  let n = msg.data[4 + offset:36 + offset] as bytes32 as uint256;
  let name: string calldata =
    msg.data[36 + offset:36 + offset + n] as string calldata;
  len = ${callee === "join" ? "join(name)" : "record(name, name as bytes calldata)"};
}`;

describe("calldata parameters", () => {
  it("inline at O2 into one call, not the other", async () => {
    const functions = async (callee: "record" | "join") => {
      const result = await compile({
        to: "ir",
        source: parameterSource(callee),
        optimizer: { level: 2 },
      });
      if (!result.success) throw new Error("compile failed");
      return [...result.value.ir.functions.keys()].sort();
    };
    // `record` is inlined everywhere; `join` is never inlined
    expect(await functions("record")).toEqual(["join"]);
    expect(await functions("join")).toEqual(["join"]);
  });

  it("are not copied to memory", async () => {
    const result = await compile({
      to: "ir",
      source: parameterSource("join"),
      optimizer: { level: 0 },
    });
    if (!result.success) throw new Error("compile failed");
    const { functions } = result.value.ir;
    for (const fn of [functions.get("join")!, functions.get("record")!]) {
      for (const parameter of fn.parameters) {
        expect(parameter.type).toMatchObject({
          kind: "ref",
          location: "calldata",
        });
      }
    }
    // The only copy from calldata is `motd = name` and the struct field
    const copies = [result.value.ir.main, ...functions.values()]
      .flatMap((fn) => [...fn.blocks.values()])
      .flatMap((block) => block.instructions)
      .filter((inst) => inst.kind === "copy");
    expect(copies).toHaveLength(2);
  });
});

describe.each(levels)("calldata parameters at O%i", (level) => {
  for (const callee of ["record", "join"] as const) {
    it.each(lengths)(`pass %i bytes to ${callee}`, async (length) => {
      const name = text(length);
      const result = await executeProgram(parameterSource(callee), {
        calldata: setName(name),
        optimizationLevel: level,
      });
      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(1n)).toBe(BigInt(length));
      await expectEncoded(result, mappingSlot(2n, sender) + 1n, name);
      if (callee === "join") await expectEncoded(result, 0n, name);
      expect(await result.getStorage(3n)).toBe(
        length > 0 ? BigInt(name.charCodeAt(0)) : 0n,
      );
    });
  }
});
