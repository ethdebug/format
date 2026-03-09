import { describe, it, expect, beforeEach } from "vitest";
import { Data } from "@ethdebug/pointers";
import { Executor } from "#executor";
import { createMachineState } from "#machine";

// Constructor that deploys: PUSH1 0x2a PUSH1 0x00 SSTORE STOP
const constructorCode =
  "65602a600055006000526006601af3";

describe("createMachineState", () => {
  let executor: Executor;

  beforeEach(async () => {
    executor = new Executor();
    await executor.deploy(constructorCode);
    await executor.execute();
  });

  describe("end-state (no traceStep)", () => {
    it("reads storage", async () => {
      const state = createMachineState(executor);
      const val = await state.storage.read({
        slot: Data.fromUint(0n),
      });
      expect(val.asUint()).toBe(42n);
    });

    it("reads storage with slice", async () => {
      const state = createMachineState(executor);
      const val = await state.storage.read({
        slot: Data.fromUint(0n),
        slice: { offset: 31n, length: 1n },
      });
      // 42 = 0x2a, in a 32-byte big-endian word the
      // last byte is at offset 31
      expect(val.asUint()).toBe(42n);
    });

    it("returns zero for stack", async () => {
      const state = createMachineState(executor);
      expect(await state.stack.length).toBe(0n);
      const val = await state.stack.peek({ depth: 0n });
      expect(val.asUint()).toBe(0n);
    });

    it("returns zero for memory", async () => {
      const state = createMachineState(executor);
      expect(await state.memory.length).toBe(0n);
      const val = await state.memory.read({
        slice: { offset: 0n, length: 32n },
      });
      expect(val.asUint()).toBe(0n);
    });

    it("uses default context values", async () => {
      const state = createMachineState(executor);
      expect(await state.programCounter).toBe(0n);
      expect(await state.opcode).toBe("STOP");
      expect(await state.traceIndex).toBe(0n);
    });

    it("accepts context overrides", async () => {
      const state = createMachineState(executor, {
        programCounter: 10n,
        opcode: "SLOAD",
        traceIndex: 5n,
      });
      expect(await state.programCounter).toBe(10n);
      expect(await state.opcode).toBe("SLOAD");
      expect(await state.traceIndex).toBe(5n);
    });

    it("reads code length", async () => {
      const state = createMachineState(executor);
      const len = await state.code.length;
      // Deployed runtime is 6 bytes (storeValueCode)
      expect(len).toBe(6n);
    });

    it("reads code bytes", async () => {
      const state = createMachineState(executor);
      const data = await state.code.read({
        slice: { offset: 0n, length: 1n },
      });
      // First byte of "602a60005500" is 0x60 (PUSH1)
      expect(data.asUint()).toBe(0x60n);
    });
  });

  describe("with traceStep", () => {
    it("reads stack from trace step", async () => {
      const state = createMachineState(executor, {
        traceStep: {
          pc: 0,
          opcode: "SSTORE",
          stack: [100n, 200n, 300n],
        },
      });

      expect(await state.stack.length).toBe(3n);

      // depth 0 = top of stack = last element
      const top = await state.stack.peek({ depth: 0n });
      expect(top.asUint()).toBe(300n);

      // depth 1 = second from top
      const second = await state.stack.peek({
        depth: 1n,
      });
      expect(second.asUint()).toBe(200n);

      // depth 2 = bottom
      const bottom = await state.stack.peek({
        depth: 2n,
      });
      expect(bottom.asUint()).toBe(100n);
    });

    it("returns zero for out-of-bounds depth", async () => {
      const state = createMachineState(executor, {
        traceStep: {
          pc: 0,
          opcode: "PUSH1",
          stack: [42n],
        },
      });

      const val = await state.stack.peek({ depth: 5n });
      expect(val.asUint()).toBe(0n);
    });

    it("supports stack peek with slice", async () => {
      const state = createMachineState(executor, {
        traceStep: {
          pc: 0,
          opcode: "PUSH1",
          stack: [0xdeadbeefn],
        },
      });

      // 0xdeadbeef padded to 32 bytes, last 4 bytes
      const val = await state.stack.peek({
        depth: 0n,
        slice: { offset: 28n, length: 4n },
      });
      expect(val.asUint()).toBe(0xdeadbeefn);
    });

    it("reads memory from trace step", async () => {
      const mem = new Uint8Array(64);
      mem[31] = 0xff;
      mem[63] = 0xab;

      const state = createMachineState(executor, {
        traceStep: {
          pc: 0,
          opcode: "MLOAD",
          stack: [],
          memory: mem,
        },
      });

      expect(await state.memory.length).toBe(64n);

      const word1 = await state.memory.read({
        slice: { offset: 0n, length: 32n },
      });
      expect(word1.asUint()).toBe(0xffn);

      const word2 = await state.memory.read({
        slice: { offset: 32n, length: 32n },
      });
      expect(word2.asUint()).toBe(0xabn);
    });

    it("derives pc/opcode from trace step", async () => {
      const state = createMachineState(executor, {
        traceStep: {
          pc: 42,
          opcode: "JUMPDEST",
          stack: [],
        },
      });

      expect(await state.programCounter).toBe(42n);
      expect(await state.opcode).toBe("JUMPDEST");
    });

    it("allows overriding trace step context", async () => {
      const state = createMachineState(executor, {
        traceStep: {
          pc: 42,
          opcode: "JUMPDEST",
          stack: [],
        },
        programCounter: 99n,
        opcode: "STOP",
      });

      expect(await state.programCounter).toBe(99n);
      expect(await state.opcode).toBe("STOP");
    });
  });
});
