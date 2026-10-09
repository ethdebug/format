import { describe, it, expect } from "vitest";
import { Data } from "@ethdebug/pointers";
import { Executor } from "#executor";
import { createMachineState } from "#machine";
import type { StepState } from "#trace";

// Constructor that deploys: PUSH1 0x2a PUSH1 0x00 SSTORE STOP
const constructorCode = "65602a600055006000526006601af3";

const memory = new Uint8Array(64);
memory[31] = 0xff;
memory[63] = 0xab;

const stepState: StepState = {
  stack: [100n, 200n, 0xdeadbeefn],
  memory,
  storage: async (slot) => (slot === 1n ? 7n : 0n),
  transient: async (slot) => (slot === 2n ? 9n : 0n),
  calldata: new Uint8Array([1, 2, 3, 4]),
  returndata: new Uint8Array([5, 6]),
  code: new Uint8Array([0x60, 0x2a]),
};

describe("createMachineState", () => {
  it("reads the stack, top first", async () => {
    const state = createMachineState(stepState);
    expect(await state.stack.length).toBe(3n);
    expect((await state.stack.peek({ depth: 0n })).asUint()).toBe(0xdeadbeefn);
    expect((await state.stack.peek({ depth: 2n })).asUint()).toBe(100n);
    expect((await state.stack.peek({ depth: 5n })).asUint()).toBe(0n);
    const sliced = await state.stack.peek({
      depth: 0n,
      slice: { offset: 28n, length: 4n },
    });
    expect(sliced.asUint()).toBe(0xdeadbeefn);
  });

  it("reads memory, zero past its end", async () => {
    const state = createMachineState(stepState);
    expect(await state.memory.length).toBe(64n);
    const read = (offset: bigint) =>
      state.memory.read({ slice: { offset, length: 32n } });
    expect((await read(0n)).asUint()).toBe(0xffn);
    expect((await read(32n)).asUint()).toBe(0xabn);
    expect((await read(64n)).asUint()).toBe(0n);
  });

  it("reads storage and transient storage, with slices", async () => {
    const state = createMachineState(stepState);
    const slot = (n: bigint) => Data.fromUint(n);
    expect((await state.storage.read({ slot: slot(1n) })).asUint()).toBe(7n);
    const byte = await state.storage.read({
      slot: slot(1n),
      slice: { offset: 31n, length: 1n },
    });
    expect(byte.asUint()).toBe(7n);
    expect((await state.transient.read({ slot: slot(2n) })).asUint()).toBe(9n);
  });

  it("reads calldata, returndata and code", async () => {
    const state = createMachineState(stepState);
    expect(await state.calldata.length).toBe(4n);
    const calldata = await state.calldata.read({
      slice: { offset: 2n, length: 2n },
    });
    expect(calldata.asUint()).toBe(0x0304n);
    expect(await state.returndata.length).toBe(2n);
    const code = await state.code.read({ slice: { offset: 0n, length: 1n } });
    expect(code.asUint()).toBe(0x60n);
  });

  it("takes the pc, opcode and trace index", async () => {
    const state = createMachineState(stepState, {
      pc: 10,
      opcode: "SLOAD",
      traceIndex: 5,
    });
    expect(await state.programCounter).toBe(10n);
    expect(await state.opcode).toBe("SLOAD");
    expect(await state.traceIndex).toBe(5n);

    const defaults = createMachineState(stepState);
    expect(await defaults.programCounter).toBe(0n);
    expect(await defaults.opcode).toBe("STOP");
    expect(await defaults.traceIndex).toBe(0n);
  });

  it("takes only a complete state (a type check)", () => {
    const { storage: _, ...partial } = stepState;
    const create = () =>
      // @ts-expect-error: a state without storage
      createMachineState(partial);
    expect(create).toBeTypeOf("function");
  });
});

describe("Executor.currentState", () => {
  it("reads the executor's storage and code now", async () => {
    const executor = new Executor();
    await executor.deploy(constructorCode);
    await executor.execute();

    const state = createMachineState(await executor.currentState());
    const value = await state.storage.read({ slot: Data.fromUint(0n) });
    expect(value.asUint()).toBe(42n);
    expect(await state.code.length).toBe(6n);
    expect(await state.stack.length).toBe(0n);
    expect(await state.memory.length).toBe(0n);
    expect(await state.calldata.length).toBe(0n);

    // it reads live: a later change shows
    await executor.setStorage(0n, 43n);
    const later = await state.storage.read({ slot: Data.fromUint(0n) });
    expect(later.asUint()).toBe(43n);
  });
});
