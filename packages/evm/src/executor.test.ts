import { describe, it, expect, beforeEach } from "vitest";
import { bytesToHex, utf8ToBytes } from "ethereum-cryptography/utils";
import { sha256 } from "ethereum-cryptography/sha256";
import { Executor } from "#executor";
import type { BlockOptions } from "#executor";
import type { FrameEvent, MemoryPolicy, TraceStep } from "#trace";

// Simple bytecodes for testing:
//
// storeValue: PUSH1 0x2a PUSH1 0x00 SSTORE STOP
//   Stores 42 at slot 0.
const storeValueCode = "602a60005500";

// returnValue: PUSH1 0x2a PUSH1 0x00 MSTORE
//              PUSH1 0x20 PUSH1 0x00 RETURN
//   Returns 42 as a 32-byte word.
const returnValueCode = "602a60005260206000f3";

// Simple CREATE constructor that deploys storeValueCode:
//   PUSH6 <runtime> PUSH1 0x00 MSTORE
//   PUSH1 0x06 PUSH1 0x1a RETURN
// We build it by hand: deploy code that copies runtime
// to memory then returns it.
//
// Runtime: 602a60005500 (6 bytes)
// Constructor:
//   PUSH6 602a60005500  =>  65602a60005500
//   PUSH1 00            =>  6000
//   MSTORE              =>  52
//   PUSH1 06            =>  6006
//   PUSH1 1a            =>  601a
//   RETURN              =>  f3
const constructorCode = "65602a600055006000526006601af3";

// mcopy: PUSH1 0x2a PUSH1 0x00 MSTORE
//        PUSH1 0x20 PUSH1 0x00 PUSH1 0x20 MCOPY
//        PUSH1 0x20 PUSH1 0x20 RETURN
//   Copies a word from offset 0 to offset 0x20 and returns it.
const mcopyCode = "602a600052" + "602060006020" + "5e" + "60206020f3";

// transient: PUSH1 0x2a PUSH1 0x01 TSTORE
//            PUSH1 0x01 TLOAD PUSH1 0x00 MSTORE
//            PUSH1 0x20 PUSH1 0x00 RETURN
//   Stores 42 in transient slot 1, loads it and returns it.
const transientCode = "602a60015d" + "60015c600052" + "60206000f3";

describe("Executor", () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor();
  });

  describe("deploy", () => {
    it("deploys bytecode via CREATE", async () => {
      await executor.deploy(constructorCode);
      const code = await executor.getCode();
      expect(bytesToHex(code)).toBe(storeValueCode);
    });

    it("throws on failed deployment", async () => {
      // FE = INVALID opcode
      await expect(executor.deploy("fe")).rejects.toThrow("Deployment failed");
    });
  });

  describe("execute", () => {
    it("calls deployed contract", async () => {
      await executor.deploy(constructorCode);
      const result = await executor.execute();
      expect(result.success).toBe(true);
      expect(result.gasUsed).toBeGreaterThan(0n);
    });

    it("reads storage after execution", async () => {
      await executor.deploy(constructorCode);
      await executor.execute();
      const value = await executor.getStorage(0n);
      expect(value).toBe(42n);
    });
  });

  describe("executeCode", () => {
    it("runs bytecode directly", async () => {
      const result = await executor.executeCode(returnValueCode);
      expect(result.success).toBe(true);
      expect(result.returnValue.length).toBe(32);

      const value = BigInt("0x" + bytesToHex(result.returnValue));
      expect(value).toBe(42n);
    });
  });

  describe("storage", () => {
    it("reads and writes storage", async () => {
      await executor.deploy(constructorCode);
      await executor.setStorage(5n, 123n);
      const value = await executor.getStorage(5n);
      expect(value).toBe(123n);
    });

    it("handles large slot values", async () => {
      await executor.deploy(constructorCode);
      const largeSlot = 2n ** 128n + 7n;
      await executor.setStorage(largeSlot, 999n);
      const value = await executor.getStorage(largeSlot);
      expect(value).toBe(999n);
    });

    it("returns 0 for unset slots", async () => {
      await executor.deploy(constructorCode);
      const value = await executor.getStorage(99n);
      expect(value).toBe(0n);
    });
  });

  describe("reset", () => {
    it("clears all state", async () => {
      await executor.deploy(constructorCode);
      await executor.execute();
      expect(await executor.getStorage(0n)).toBe(42n);

      await executor.reset();
      // After reset, deploy again to have a valid address
      await executor.deploy(constructorCode);
      expect(await executor.getStorage(0n)).toBe(0n);
    });
  });

  describe("addresses", () => {
    it("provides deployer address", () => {
      const addr = executor.getDeployerAddress();
      expect(addr).toBeDefined();
    });

    it("provides contract address", () => {
      const addr = executor.getContractAddress();
      expect(addr).toBeDefined();
    });

    it("updates contract address after deploy", async () => {
      const before = executor.getContractAddress();
      await executor.deploy(constructorCode);
      const after = executor.getContractAddress();
      // CREATE computes a new address
      expect(after).not.toEqual(before);
    });
  });

  describe("cancun opcodes", () => {
    it("executes MCOPY", async () => {
      const result = await executor.executeCode(mcopyCode);
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(bytesToHex(result.returnValue)).toBe("2a".padStart(64, "0"));
    });

    it("executes TSTORE and TLOAD", async () => {
      const result = await executor.executeCode(transientCode);
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(bytesToHex(result.returnValue)).toBe("2a".padStart(64, "0"));
    });
  });
});

// Creation code that returns `runtime` as the deployed code:
//   PUSH2 <length> DUP1 PUSH1 0x0c PUSH1 0x00 CODECOPY
//   PUSH1 0x00 RETURN <runtime>
function creation(runtime: string): string {
  const length = (runtime.length / 2).toString(16).padStart(4, "0");
  return `61${length}80600c6000396000f3${runtime}`;
}

const word = (value: bigint) => value.toString(16).padStart(64, "0");

// store: stores calldata word 0 at slot 0 and returns it.
//   PUSH1 0 CALLDATALOAD DUP1 PUSH1 0 SSTORE
//   PUSH1 0 MSTORE PUSH1 0x20 PUSH1 0 RETURN
const storeCode = "600035" + "80600055" + "600052" + "60206000f3";

// forward(to): stores calldata word 0 at slot 0, calls `to` with that
// word and returns what `to` returns.
//   PUSH1 0 CALLDATALOAD DUP1 PUSH1 0 SSTORE PUSH1 0 MSTORE
//   CALL(GAS, to, 0, 0, 0x20, 0x20, 0x20) POP
//   PUSH1 0x20 PUSH1 0x20 RETURN
const forwardCode = (to: string) =>
  "600035" +
  "80600055" +
  "600052" +
  "60206020602060006000" +
  `73${to.slice(2)}` +
  "5af150" +
  "60206020f3";

// block: returns PREVRANDAO, NUMBER, TIMESTAMP, CHAINID, COINBASE and
// BASEFEE as six words.
const blockCode =
  "44600052" +
  "43602052" +
  "42604052" +
  "46606052" +
  "41608052" +
  "4860a052" +
  "60c06000f3";

// transient: stores TLOAD(1) at slot 0, then TSTORE(1, 42).
const transientCounterCode = "60015c600055" + "602a60015d" + "00";

const alice = "0x" + "aa".repeat(20);
const bob = "0x" + "bb".repeat(20);
const carol = "0x" + "cc".repeat(20);

describe("Executor scenarios", () => {
  let executor: Executor;

  beforeEach(async () => {
    executor = new Executor();
    for (const account of [alice, bob, carol]) {
      await executor.fund(account, 10n ** 18n);
    }
  });

  describe("deploy and call", () => {
    it("deploys contracts from any account", async () => {
      const store = await executor.deploy({
        from: alice,
        create: creation(storeCode),
      });
      expect(store.success).toBe(true);
      const forward = await executor.deploy({
        from: bob,
        create: creation(forwardCode(store.address!)),
      });
      expect(forward.success).toBe(true);
      expect(forward.address).not.toBe(store.address);

      expect(bytesToHex(await executor.getCode(store.address))).toBe(storeCode);
    });

    it("reports message frames with depth and calldata", async () => {
      const store = await executor.deploy({
        from: alice,
        create: creation(storeCode),
      });
      const forward = await executor.deploy({
        from: bob,
        create: creation(forwardCode(store.address!)),
      });

      const events: FrameEvent[] = [];
      const steps: TraceStep[] = [];
      const result = await executor.call(
        { from: carol, to: forward.address!, input: word(7n) },
        { step: (step) => steps.push(step), frame: (e) => events.push(e) },
      );

      expect(result.success).toBe(true);
      expect(bytesToHex(result.returnValue)).toBe(word(7n));
      expect(await executor.getStorage(0n, store.address)).toBe(7n);
      expect(await executor.getStorage(0n, forward.address)).toBe(7n);

      expect(events.map(({ kind, frame }) => [kind, frame.depth])).toEqual([
        ["enter", 0],
        ["enter", 1],
        ["exit", 1],
        ["exit", 0],
      ]);
      const [outer, inner] = events.map(({ frame }) => frame);
      expect(outer).toMatchObject({
        address: forward.address,
        codeAddress: forward.address,
        caller: carol,
        create: false,
      });
      expect(bytesToHex(outer.calldata)).toBe(word(7n));
      expect(inner).toMatchObject({
        address: store.address,
        caller: forward.address,
      });
      expect(bytesToHex(inner.calldata)).toBe(word(7n));

      const exit = events[2];
      expect(exit.kind === "exit" && exit.reverted).toBe(false);
      expect(exit.kind === "exit" && bytesToHex(exit.returnData)).toBe(
        word(7n),
      );

      expect(new Set(steps.map(({ depth }) => depth))).toEqual(new Set([0, 1]));
      for (const step of steps) {
        expect(step.address).toBe(
          step.depth === 0 ? forward.address : store.address,
        );
        expect(step.gasCost).toBeGreaterThanOrEqual(0n);
      }
      const sstore = steps.find(({ opcode }) => opcode === "SSTORE")!;
      expect(sstore.gasCost).toBeGreaterThan(2000n);
    });

    it("reports a create frame and a revert", async () => {
      const events: FrameEvent[] = [];
      const deployed = await executor.deploy(
        { from: alice, create: creation(storeCode) },
        { frame: (e) => events.push(e) },
      );
      expect(events[0].frame).toMatchObject({
        create: true,
        address: deployed.address,
      });

      // INVALID
      const reverted: FrameEvent[] = [];
      const failed = await executor.deploy(
        { from: alice, create: "fe" },
        { frame: (e) => reverted.push(e) },
      );
      expect(failed.success).toBe(false);
      expect(failed.address).toBeUndefined();
      expect(reverted[1].kind === "exit" && reverted[1].reverted).toBe(true);
    });

    it("keeps the legacy deploy and execute", async () => {
      await executor.deploy(constructorCode);
      const steps: TraceStep[] = [];
      await executor.execute({}, (step) => steps.push(step));
      expect(await executor.getStorage(0n)).toBe(42n);
      expect(steps.every(({ memory }) => memory !== undefined)).toBe(true);
    });
  });

  describe("accounts", () => {
    it("sends value from funded accounts", async () => {
      const { address } = await executor.deploy({
        from: alice,
        create: creation("00"),
        value: 5n,
      });
      expect(address).toBeDefined();

      const poor = "0x" + "dd".repeat(20);
      const result = await executor.call({ from: poor, to: alice, value: 1n });
      expect(result.success).toBe(false);
    });
  });

  describe("block", () => {
    it("lets contracts read the block", async () => {
      executor = new Executor({ chainId: 31337n });
      await executor.fund(alice, 10n ** 18n);
      const { address } = await executor.deploy({
        from: alice,
        create: creation(blockCode),
      });
      const block: BlockOptions = {
        number: 12n,
        timestamp: 1_700_000_000n,
        prevrandao: 0xabcdefn,
        coinbase: "0x" + "c0".repeat(20),
        baseFee: 7n,
      };
      const result = await executor.call({ from: alice, to: address!, block });
      expect(bytesToHex(result.returnValue)).toBe(
        [0xabcdefn, 12n, 1_700_000_000n, 31337n, BigInt(block.coinbase!), 7n]
          .map(word)
          .join(""),
      );
    });

    it("runs in a zero block without the option", async () => {
      // blockCode without CHAINID, COINBASE and BASEFEE (the zero
      // block has no base fee)
      await executor.deploy(creation(blockCode.slice(0, 24) + "60606000f3"));
      const result = await executor.execute();
      expect(bytesToHex(result.returnValue)).toBe(word(0n).repeat(3));
    });
  });

  describe("memory policy", () => {
    const traceWith = async (memory: MemoryPolicy) => {
      const store = await executor.deploy({
        from: alice,
        create: creation(storeCode),
      });
      const forward = await executor.deploy({
        from: bob,
        create: creation(forwardCode(store.address!)),
      });
      const steps: TraceStep[] = [];
      await executor.call(
        { from: carol, to: forward.address!, input: word(7n) },
        { step: (step) => steps.push(step), memory },
      );
      return steps;
    };

    it("records no memory with none", async () => {
      const steps = await traceWith("none");
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every(({ memory }) => memory === undefined)).toBe(true);
    });

    it("copies memory at every step with full", async () => {
      const steps = await traceWith("full");
      const arrays = new Set(steps.map(({ memory }) => memory));
      expect(arrays.size).toBe(steps.length);
    });

    it("shares unchanged memory with changed", async () => {
      const full = await traceWith("full");
      executor = new Executor();
      for (const account of [alice, bob, carol]) {
        await executor.fund(account, 10n ** 18n);
      }
      const changed = await traceWith("changed");

      expect(changed.map(({ memory }) => bytesToHex(memory!))).toEqual(
        full.map(({ memory }) => bytesToHex(memory!)),
      );
      const arrays = new Set(changed.map(({ memory }) => memory));
      expect(arrays.size).toBeLessThan(changed.length / 2);
    });
  });

  describe("transactions", () => {
    it("clears transient storage between transactions", async () => {
      const { address } = await executor.deploy({
        from: alice,
        create: creation(transientCounterCode),
      });
      await executor.call({ from: alice, to: address! });
      await executor.call({ from: bob, to: address! });
      expect(await executor.getStorage(0n, address)).toBe(0n);
    });

    it("ends legacy executes only on request", async () => {
      await executor.deploy(creation(storeCode));
      const sstoreCost = async () => {
        let cost: bigint | undefined;
        await executor.execute({ data: word(1n) }, (step) => {
          if (step.opcode === "SSTORE") cost = step.gasCost;
        });
        return cost!;
      };
      const first = await sstoreCost();
      // the slot stays warm: execute does not end the transaction
      expect(await sstoreCost()).toBeLessThan(first);

      await executor.endTransaction();
      expect(await sstoreCost()).toBeGreaterThan(2000n);
    });

    it("makes addresses cold again after a transaction", async () => {
      const { address } = await executor.deploy({
        from: alice,
        create: creation(storeCode),
      });
      const costs: bigint[] = [];
      for (const from of [alice, bob]) {
        const steps: TraceStep[] = [];
        await executor.call({ from, to: address!, input: word(1n) }, (step) =>
          steps.push(step),
        );
        costs.push(steps.find(({ opcode }) => opcode === "SSTORE")!.gasCost!);
      }
      // the second SSTORE writes the same value, but its slot is cold
      // again, so it pays the cold access cost
      expect(costs[1]).toBeGreaterThan(2000n);
    });
  });

  describe("determinism", () => {
    const digest = async () => {
      const executor = new Executor({ chainId: 1n });
      for (const account of [alice, bob, carol]) {
        await executor.fund(account, 10n ** 18n);
      }
      const records: unknown[] = [];
      const trace = {
        step: (step: TraceStep) => records.push(step),
        frame: (event: FrameEvent) => records.push(event),
        memory: "changed" as const,
      };
      const store = await executor.deploy(
        { from: alice, create: creation(storeCode) },
        trace,
      );
      const forward = await executor.deploy(
        { from: bob, create: creation(forwardCode(store.address!)) },
        trace,
      );
      for (const [i, from] of [carol, alice, bob].entries()) {
        await executor.call(
          {
            from,
            to: forward.address!,
            input: word(BigInt(i + 3)),
            block: { number: BigInt(i + 1), prevrandao: BigInt(i * 99) },
          },
          trace,
        );
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

    it("gives the same trace digest for the same inputs", async () => {
      expect(await digest()).toBe(await digest());
    });
  });
});
