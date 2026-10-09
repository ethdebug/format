import { describe, it, expect, beforeEach } from "vitest";
import { bytesToHex, utf8ToBytes } from "ethereum-cryptography/utils";
import { sha256 } from "ethereum-cryptography/sha256";
import { Executor } from "#executor";
import { createMachineState } from "#machine";
import { createTrace, createMachine } from "#trace";
import type { FrameEvent, MemoryPolicy, Trace } from "#trace";
import { asm, creation, word } from "../test/bytecode.js";
import {
  alice,
  bob,
  carol,
  deployed,
  forward,
  funded,
  recurse,
  store,
} from "../test/contracts.js";

// Constructor that deploys: PUSH1 0x2a PUSH1 0x00 SSTORE STOP
const constructorCode = "65602a600055006000526006601af3";

/** Index of the `n`th step (from 0) matching, or -1 */
const find = (
  trace: Trace<unknown>,
  match: (step: Trace["steps"][number]) => boolean,
  n = 0,
) => {
  let seen = 0;
  return trace.steps.findIndex((step) => match(step) && seen++ === n);
};

describe("createTrace", () => {
  let executor: Executor;

  beforeEach(async () => {
    executor = await funded();
  });

  it("gives the state at past steps across frames and reverts", async () => {
    const address = await deployed(executor, recurse);
    const trace = createTrace();
    const result = await executor.call(
      { from: alice, to: address, input: word(0n) },
      trace,
    );
    expect(result.success).toBe(true);

    expect(
      trace.frames.map(({ depth, reverted }) => [depth, reverted]),
    ).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ]);
    expect(trace.frames[2].parent).toBe(1);

    const slots = async (index: number) => {
      const { storage } = trace.stateAt(index);
      return Promise.all([0n, 1n, 2n].map((slot) => storage(slot)));
    };
    const at = (depth: number, opcode: string, n = 0) =>
      find(trace, (step) => step.depth === depth && step.opcode === opcode, n);

    // at depth 2, after its SSTORE, every frame's write holds
    expect(await slots(at(2, "SSTORE") + 1)).toEqual([0x10n, 0x11n, 0x12n]);
    // back at depth 1, before it reverts
    const revert = at(1, "REVERT");
    expect(await slots(revert)).toEqual([0x10n, 0x11n, 0x12n]);
    // back at depth 0, depth 1's frame (and depth 2's in it) is undone
    const after = at(0, "POP");
    expect(await slots(after)).toEqual([0x10n, 0n, 0n]);
    // before anything ran
    expect(await slots(0)).toEqual([0n, 0n, 0n]);

    // calldata is the frame's; return data is the last call's
    const atDepth1 = trace.stateAt(revert);
    expect(bytesToHex(atDepth1.calldata)).toBe(word(1n));
    expect(atDepth1.returndata).toHaveLength(0);
    expect(bytesToHex(trace.stateAt(after).calldata)).toBe(word(0n));
    expect(bytesToHex(trace.stateAt(after).returndata)).toBe(word(2n));
    expect(bytesToHex(trace.stateAt(after).code)).toBe(recurse);

    // the committed end state agrees
    expect(await executor.getStorage(1n, address)).toBe(0n);
  });

  it("feeds createMachineState", async () => {
    const address = await deployed(executor, store);
    const trace = createTrace();
    await executor.call({ from: alice, to: address, input: word(7n) }, trace);
    // a later transaction does not change the trace's states
    await executor.call({ from: alice, to: address, input: word(9n) });

    const sstore = find(trace, (step) => step.opcode === "SSTORE");
    const { pc, opcode } = trace.steps[sstore];
    const state = createMachineState(trace.stateAt(sstore), {
      pc,
      opcode,
      traceIndex: sstore,
    });
    expect(await state.opcode).toBe("SSTORE");
    const { Data } = await import("@ethdebug/pointers");
    const slot0 = await state.storage.read({ slot: Data.fromUint(0n) });
    expect(slot0.asUint()).toBe(0n);
    const calldata = await state.calldata.read({
      slice: { offset: 0n, length: 32n },
    });
    expect(calldata.asUint()).toBe(7n);
    expect((await state.stack.peek({ depth: 1n })).asUint()).toBe(7n);

    // a trace's state knows its step
    const own = createMachineState(trace.stateAt(sstore));
    expect(await own.traceIndex).toBe(BigInt(sstore));
    expect(await own.programCounter).toBe(BigInt(pc));
    expect(await own.opcode).toBe("SSTORE");

    const next = trace.stateAt(sstore + 1);
    expect(await next.storage(0n)).toBe(7n);
  });

  it("reads untouched storage only while the executor is unchanged", async () => {
    const address = await deployed(executor, store);
    await executor.setStorage(5n, 55n, address);
    const trace = createTrace();
    await executor.call({ from: alice, to: address, input: word(7n) }, trace);
    expect(await trace.stateAt(0).storage(5n)).toBe(55n);

    await executor.call({ from: alice, to: address, input: word(8n) });
    await expect(trace.stateAt(0).storage(5n)).rejects.toThrow("not touched");
    // touched slots still read
    expect(await trace.stateAt(0).storage(0n)).toBe(0n);
  });

  it("records one transaction", async () => {
    const address = await deployed(executor, store);
    const trace = createTrace();
    await executor.call({ from: alice, to: address }, trace);
    await expect(
      executor.call({ from: alice, to: address }, trace),
    ).rejects.toThrow("one transaction");
  });

  it("reads transient storage at a step", async () => {
    const address = await deployed(
      executor,
      asm(`PUSH1 42 PUSH1 1 TSTORE STOP`),
    );
    const trace = createTrace();
    await executor.call({ from: alice, to: address }, trace);
    const tstore = find(trace, (step) => step.opcode === "TSTORE");
    expect(await trace.stateAt(tstore).transient(1n)).toBe(0n);
    expect(await trace.stateAt(tstore + 1).transient(1n)).toBe(42n);
  });

  it("undoes transient storage written in a reverted frame", async () => {
    // TSTORE(1, 0x20 + n); for n = 0, calls itself with 1; for n = 1,
    // reverts
    const address = await deployed(
      executor,
      asm(`PUSH1 0 CALLDATALOAD
        DUP1 PUSH1 32 ADD PUSH1 1 TSTORE
        DUP1 @child JUMPI
        PUSH1 1 PUSH1 0 MSTORE
        PUSH1 0 PUSH1 0 PUSH1 32 PUSH1 0 PUSH1 0 ADDRESS GAS CALL POP
        STOP
        child: PUSH1 0 PUSH1 0 REVERT`),
    );
    const trace = createTrace();
    await executor.call({ from: alice, to: address, input: word(0n) }, trace);
    expect(trace.frames.map(({ reverted }) => reverted)).toEqual([false, true]);

    const revert = find(trace, (step) => step.opcode === "REVERT");
    expect(await trace.stateAt(revert).transient(1n)).toBe(0x21n);
    const after = find(trace, (step) => step.opcode === "POP");
    expect(await trace.stateAt(after).transient(1n)).toBe(0x20n);
  });

  it("clears return data at a call that fails before it starts", async () => {
    const other = await deployed(executor, store);
    // CALL other (returns a word); then CALL other with 1 wei, which
    // the contract does not have
    const address = await deployed(
      executor,
      asm(`PUSH1 0 PUSH1 0 PUSH1 0 PUSH1 0 PUSH1 0 PUSH20 ${other} GAS
        CALL POP
        PUSH1 0 PUSH1 0 PUSH1 0 PUSH1 0 PUSH1 1 PUSH20 ${other} GAS
        CALL POP
        STOP`),
    );
    const trace = createTrace();
    await executor.call({ from: alice, to: address }, trace);
    const pop = (n: number) =>
      find(trace, (step) => step.opcode === "POP" && step.depth === 0, n);
    expect(trace.stateAt(pop(0)).returndata).toHaveLength(32);
    expect(trace.stateAt(pop(1)).returndata).toHaveLength(0);
  });

  it("types a trace's state by its memory policy", () => {
    // type checks only: these functions do not run
    const literal = () => createMachineState(createTrace().stateAt(0));
    const changed = () =>
      createMachineState(createTrace({ memory: "changed" }).stateAt(0));
    const general = (memory: MemoryPolicy) =>
      // @ts-expect-error: a policy that may be "none" may give no memory
      createMachineState(createTrace({ memory }).stateAt(0));
    const none = () =>
      // @ts-expect-error: no memory
      createMachineState(createTrace({ memory: "none" }).stateAt(0));
    expect([literal, changed, general, none]).toHaveLength(4);
  });

  it("reports DELEGATECALL frames", async () => {
    const library = await deployed(executor, store);
    // DELEGATECALL(GAS, library, 0, CALLDATASIZE, 0, 0) with the calldata
    const proxy = await deployed(
      executor,
      asm(`CALLDATASIZE PUSH1 0 PUSH1 0 CALLDATACOPY
        PUSH1 0 PUSH1 0 CALLDATASIZE PUSH1 0 PUSH20 ${library} GAS
        DELEGATECALL STOP`),
    );
    const trace = createTrace();
    await executor.call({ from: carol, to: proxy, input: word(5n) }, trace);

    const [, frame] = trace.frames;
    expect(frame).toMatchObject({
      depth: 1,
      address: proxy,
      codeAddress: library,
      caller: carol,
      delegatecall: true,
    });
    const sstore = find(trace, (step) => step.opcode === "SSTORE");
    expect(trace.steps[sstore]).toMatchObject({
      op: 0x55,
      depth: 1,
      address: proxy,
      codeAddress: library,
    });
    expect(await trace.stateAt(sstore + 1).storage(0n)).toBe(5n);
    expect(bytesToHex(trace.stateAt(sstore).code)).toBe(store);
    expect(await executor.getStorage(0n, proxy)).toBe(5n);
    expect(await executor.getStorage(0n, library)).toBe(0n);
  });

  it("reports CREATE and CREATE2 frames", async () => {
    // CREATE and CREATE2 (salt 0x42) of the init code in the calldata;
    // stores the two addresses at slots 0 and 1
    const factory = await deployed(
      executor,
      asm(`CALLDATASIZE PUSH1 0 PUSH1 0 CALLDATACOPY
        CALLDATASIZE PUSH1 0 PUSH1 0 CREATE PUSH1 0 SSTORE
        PUSH1 0x42 CALLDATASIZE PUSH1 0 PUSH1 0 CREATE2 PUSH1 1 SSTORE
        STOP`),
    );
    const events: FrameEvent[] = [];
    const trace = createTrace({ frame: (event) => events.push(event) });
    const result = await executor.call(
      { from: alice, to: factory, input: creation(store) },
      trace,
    );
    expect(result.success).toBe(true);

    const created = await executor.getStorage(0n, factory);
    const created2 = await executor.getStorage(1n, factory);
    const hex = (value: bigint) => "0x" + word(value, 20);
    expect(
      events.map(({ kind, frame }) => [kind, frame.depth, frame.address]),
    ).toEqual([
      ["enter", 0, factory],
      ["enter", 1, hex(created)],
      ["exit", 1, hex(created)],
      ["enter", 1, hex(created2)],
      ["exit", 1, hex(created2)],
      ["exit", 0, factory],
    ]);
    expect(trace.frames[2]).toMatchObject({ create: true, reverted: false });

    // frame events carry their first and last step indexes
    const enter2 = events[3];
    const exit2 = events[4];
    expect(enter2.kind === "enter" && enter2.first).toBe(trace.frames[2].first);
    expect(exit2.kind === "exit" && exit2.last).toBe(trace.frames[2].end - 1);
    expect(trace.steps[trace.frames[2].first].depth).toBe(1);
    expect(trace.steps[trace.frames[2].end].depth).toBe(0);
    expect(bytesToHex(trace.frames[2].initcode!)).toBe(creation(store));

    const inCreate2 = trace.steps.slice(
      trace.frames[2].first,
      trace.frames[2].end,
    );
    expect(inCreate2.length).toBeGreaterThan(0);
    for (const step of inCreate2) {
      expect(step.address).toBe(hex(created2));
    }
    // after a successful create, there is no return data
    const sstore = find(trace, (step) => step.opcode === "SSTORE", 1);
    expect(trace.stateAt(sstore).returndata).toHaveLength(0);
    expect(bytesToHex(await executor.getCode(hex(created2)))).toBe(store);
  });

  describe("memory", () => {
    // writes memory with every kind of instruction that can
    const memoryCode = (other: string) =>
      asm(`
      PUSH1 0xaa PUSH1 3 MSTORE8
      PUSH1 4 PUSH1 0 PUSH1 64 CALLDATACOPY
      PUSH1 8 PUSH1 0 PUSH1 96 CODECOPY
      PUSH1 8 PUSH1 0 PUSH1 128 PUSH20 ${other} EXTCODECOPY
      PUSH1 32 PUSH1 160 PUSH1 32 PUSH1 64 PUSH1 0 PUSH20 ${other} GAS
      CALL POP
      PUSH1 32 PUSH1 0 PUSH1 192 RETURNDATACOPY
      PUSH1 32 PUSH1 160 PUSH1 224 MCOPY
      PUSH1 32 PUSH1 0 KECCAK256 POP
      PUSH2 512 MLOAD POP
      STOP
    `);

    const traceWith = async <S>(trace: Trace<S>) => {
      const executor = await funded();
      const other = await deployed(executor, store);
      const address = await deployed(executor, memoryCode(other));
      await executor.call(
        { from: alice, to: address, input: word(0x1234n) },
        trace,
      );
      return trace;
    };

    it("records none", async () => {
      const trace = await traceWith(createTrace({ memory: "none" }));
      const state = trace.stateAt(0);
      expect("memory" in state).toBe(false);
      // @ts-expect-error: a state without memory
      expect(() => createMachineState(state)).toThrow();
    });

    it("copies at every step with full", async () => {
      const trace = await traceWith(createTrace({ memory: "full" }));
      const arrays = new Set(
        trace.steps.map((_, i) => trace.stateAt(i).memory),
      );
      expect(arrays.size).toBe(trace.steps.length);
    });

    it("shares unchanged memory with changed", async () => {
      const full = await traceWith(createTrace({ memory: "full" }));
      const changed = await traceWith(createTrace({ memory: "changed" }));
      const memories = (trace: typeof full) =>
        trace.steps.map((_, i) => bytesToHex(trace.stateAt(i).memory));
      expect(memories(changed)).toEqual(memories(full));
      expect(new Set(memories(full)).size).toBeGreaterThan(8);

      const arrays = new Set(
        changed.steps.map((_, i) => changed.stateAt(i).memory),
      );
      expect(arrays.size).toBeLessThan(changed.steps.length / 2);
    });
  });

  describe("determinism", () => {
    const digest = async () => {
      const executor = await funded(new Executor({ chainId: 1n }));
      const records: unknown[] = [];
      const record = (trace: Trace) => {
        records.push(trace.steps, trace.frames);
        trace.steps.forEach((_, i) => {
          const { stack, memory, calldata, returndata } = trace.stateAt(i);
          records.push(stack, memory, calldata, returndata);
        });
      };
      const inner = await deployed(executor, recurse);
      const outer = await deployed(executor, forward(inner));
      for (const [i, from] of [carol, alice, bob].entries()) {
        const trace = createTrace({ memory: "changed" });
        await executor.call(
          {
            from,
            to: i === 1 ? inner : outer,
            input: word(BigInt(i)),
            block: { number: BigInt(i + 1), prevrandao: BigInt(i * 99) },
          },
          trace,
        );
        record(trace);
      }
      const json = JSON.stringify(records, (_, value) =>
        typeof value === "bigint"
          ? value.toString()
          : value instanceof Uint8Array
            ? bytesToHex(value)
            : value,
      );
      return bytesToHex(sha256(utf8ToBytes(json)));
    };

    it("gives the same digest for the same inputs", async () => {
      expect(await digest()).toBe(await digest());
    });
  });
});

describe("createMachine", () => {
  let executor: Executor;

  beforeEach(async () => {
    executor = new Executor();
    await executor.deploy(constructorCode);
  });

  it("returns a Machine with trace()", () => {
    const machine = createMachine(executor);
    expect(machine.trace).toBeDefined();
  });

  it("yields Machine.State for each step", async () => {
    const machine = createMachine(executor);
    const states: unknown[] = [];

    for await (const state of machine.trace()) {
      states.push(state);
    }

    expect(states.length).toBeGreaterThan(0);
  });

  it("provides correct traceIndex", async () => {
    const machine = createMachine(executor);
    let index = 0n;

    for await (const state of machine.trace()) {
      const traceIndex = await state.traceIndex;
      expect(traceIndex).toBe(index);
      index++;
    }
  });

  it("provides program counter and opcode", async () => {
    const machine = createMachine(executor);
    let first = true;

    for await (const state of machine.trace()) {
      if (first) {
        const pc = await state.programCounter;
        const opcode = await state.opcode;
        expect(pc).toBe(0n);
        expect(typeof opcode).toBe("string");
        expect(opcode.length).toBeGreaterThan(0);
        first = false;
      }
    }
  });

  it("provides stack data at each step", async () => {
    const machine = createMachine(executor);
    let foundNonEmpty = false;

    for await (const state of machine.trace()) {
      const len = await state.stack.length;
      if (len > 0n) {
        foundNonEmpty = true;
        const top = await state.stack.peek({
          depth: 0n,
        });
        expect(top.length).toBeGreaterThan(0);
      }
    }

    expect(foundNonEmpty).toBe(true);
  });

  it("provides storage data", async () => {
    // Execute first to populate storage
    await executor.execute();

    const machine = createMachine(executor);
    const { Data } = await import("@ethdebug/pointers");

    for await (const state of machine.trace()) {
      const val = await state.storage.read({
        slot: Data.fromUint(0n),
      });
      // After the first execute, slot 0 = 42
      expect(val.asUint()).toBe(42n);
      break; // just check first state
    }
  });
});
