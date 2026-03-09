import { describe, it, expect, beforeEach } from "vitest";
import { Executor } from "#executor";
import { createTraceCollector, createMachine } from "#trace";

// Constructor that deploys: PUSH1 0x2a PUSH1 0x00 SSTORE STOP
const constructorCode = "65602a600055006000526006601af3";

describe("createTraceCollector", () => {
  it("collects trace steps during execution", async () => {
    const executor = new Executor();
    await executor.deploy(constructorCode);

    const [handler, getTrace] = createTraceCollector();
    await executor.execute({}, handler);
    const trace = getTrace();

    expect(trace.steps.length).toBeGreaterThan(0);

    // First step should be at PC 0
    expect(trace.steps[0].pc).toBe(0);
    expect(trace.steps[0].opcode).toBeDefined();
    expect(trace.steps[0].stack).toBeInstanceOf(Array);
  });

  it("captures memory when available", async () => {
    const executor = new Executor();
    // Use bytecode that writes to memory:
    // PUSH1 0x42 PUSH1 0x00 MSTORE STOP
    // = 60 42 60 00 52 00
    const memCode = "604260005200";
    const result = await executor.executeCode(memCode);
    expect(result.success).toBe(true);

    // Now deploy something and trace with memory
    // Constructor: PUSH6 <runtime> PUSH1 0 MSTORE
    //              PUSH1 6 PUSH1 0x1a RETURN
    // where runtime = 604260005200 (MSTORE bytecode)
    const memConstructor = "656042600052006000526006601af3";
    await executor.deploy(memConstructor);

    const [handler, getTrace] = createTraceCollector();
    await executor.execute({}, handler);
    const trace = getTrace();

    // The runtime does MSTORE, so memory should grow
    const hasMemory = trace.steps.some((s) => s.memory && s.memory.length > 0);
    expect(hasMemory).toBe(true);
  });

  it("captures gas remaining", async () => {
    const executor = new Executor();
    await executor.deploy(constructorCode);

    const [handler, getTrace] = createTraceCollector();
    await executor.execute({}, handler);
    const trace = getTrace();

    expect(trace.steps[0].gasRemaining).toBeGreaterThan(0n);
  });

  it("returns independent copies", async () => {
    const executor = new Executor();
    await executor.deploy(constructorCode);

    const [handler, getTrace] = createTraceCollector();
    await executor.execute({}, handler);

    const trace1 = getTrace();
    const trace2 = getTrace();
    expect(trace1.steps).toEqual(trace2.steps);
    expect(trace1.steps).not.toBe(trace2.steps);
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
