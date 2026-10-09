import { describe, it, expect } from "vitest";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

import { dereference } from "@ethdebug/pointers";
import { createMachineState } from "@ethdebug/evm";

import { executeProgram } from "#test/evm/behavioral";

const word = (n: bigint) => n.toString(16).padStart(64, "0");

// slot of `m[key]` for a mapping at `slot`
const mappingSlot = (key: bigint, slot: bigint) =>
  BigInt("0x" + bytesToHex(keccak256(hexToBytes(word(key) + word(slot)))));

const source = `name StructSlots;

define {
  struct Inner { p: uint256; q: uint256; };
  struct Outer { a: uint256; b: uint256; c: uint256; inner: Inner; };
}

storage {
  [5] s: Outer;
  [20] sum: uint256;
  [30] m: mapping<uint256, Outer>;
}

code {
  s.a = 1;
  s.b = 2;
  s.c = 3;
  s.inner.p = 4;
  s.inner.q = 5;
  m[7].c = 6;
  m[7].inner.q = 7;
  sum = s.b + s.c + s.inner.q + m[7].c + m[7].inner.q;
}
`;

describe("storage struct fields", () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`writes and reads each field in its own slot at O${level}`, async () => {
      const result = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(result.callSuccess).toBe(true);

      const slots = [5n, 6n, 7n, 8n, 9n].map(result.getStorage);
      expect(await Promise.all(slots)).toEqual([1n, 2n, 3n, 4n, 5n]);

      const base = mappingSlot(7n, 30n);
      expect(await result.getStorage(base + 2n)).toBe(6n);
      expect(await result.getStorage(base + 4n)).toBe(7n);

      expect(await result.getStorage(20n)).toBe(2n + 3n + 5n + 6n + 7n);
    });
  }
});

const packedSource = `name PackedSlots;

define {
  struct Packed { a: uint8; b: uint64; c: address; };
}

storage {
  [0] p: Packed;
  [1] a: uint256;
  [2] b: uint256;
  [3] c: address;
}

code {
  p.a = 7;
  p.b = 1988;
  p.c = 0x1234567890123456789012345678901234567890;
  a = p.a;
  b = p.b;
  c = p.c;
}
`;

describe("packed storage struct fields", () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`reads back each field where it was written at O${level}`, async () => {
      const result = await executeProgram(packedSource, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(result.callSuccess).toBe(true);

      // packed from the low-order end: a at byte 0, b at 1-8, c at 9-28
      expect(await result.getStorage(0n)).toBe(
        (0x1234567890123456789012345678901234567890n << 72n) |
          (1988n << 8n) |
          7n,
      );
      expect(await result.getStorage(1n)).toBe(7n);
      expect(await result.getStorage(2n)).toBe(1988n);
      expect(await result.getStorage(3n)).toBe(
        0x1234567890123456789012345678901234567890n,
      );
    });
  }
});

describe("packed storage struct field pointers", () => {
  for (const level of [0, 1, 2, 3] as const) {
    it(`resolve to the bytes of each field at O${level}`, async () => {
      const { executor, getStorage } = await executeProgram(packedSource, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(await getStorage(0n)).not.toBe(0n);

      const { compile } = await import("#compiler");
      const compiled = await compile({
        to: "bytecode",
        source: packedSource,
        optimizer: { level },
      });
      if (!compiled.success) throw new Error("compilation failed");
      const context = compiled.value.bytecode.runtimeProgram.context;
      const variable =
        context && "variables" in context
          ? context.variables.find(({ identifier }) => identifier === "p")
          : undefined;
      expect(variable?.pointer).toBeDefined();

      const state = createMachineState(await executor.currentState());
      const cursor = await dereference(variable!.pointer!, { state });
      const view = await cursor.view(state);
      const read = async (name: string) =>
        (await view.read(view.regions.lookup[name])).asUint();

      expect(await read("a")).toBe(7n);
      expect(await read("b")).toBe(1988n);
      expect(await read("c")).toBe(0x1234567890123456789012345678901234567890n);
    });
  }
});
