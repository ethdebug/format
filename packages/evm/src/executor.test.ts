import { describe, it, expect, beforeEach } from "vitest";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import { keccak256 } from "ethereum-cryptography/keccak";
import { Executor } from "#executor";
import type { BlockOptions } from "#executor";
import type { FrameEvent, TraceStep } from "#trace";
import { asm, creation, word } from "../test/bytecode.js";
import {
  alice,
  bob,
  carol,
  deployed,
  forward,
  funded,
  store,
} from "../test/contracts.js";

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

describe("Executor transactions", () => {
  let executor: Executor;

  beforeEach(async () => {
    executor = await funded();
  });

  describe("deploy and call", () => {
    it("deploys contracts from any account", async () => {
      const first = await executor.deploy({
        from: alice,
        create: creation(store),
      });
      const second = await executor.deploy({
        from: bob,
        create: creation(forward(first.address!)),
      });
      expect(first.success && second.success).toBe(true);
      expect(second.address).not.toBe(first.address);
      expect(bytesToHex(await executor.getCode(first.address))).toBe(store);
    });

    it("calls between contracts, reporting frames", async () => {
      const inner = await deployed(executor, store);
      const outer = await deployed(executor, forward(inner));

      const events: FrameEvent[] = [];
      const steps: TraceStep[] = [];
      const result = await executor.call(
        { from: carol, to: outer, input: word(7n) },
        { step: (step) => steps.push(step), frame: (e) => events.push(e) },
      );

      expect(result.success).toBe(true);
      expect(bytesToHex(result.returnValue)).toBe(word(7n));
      expect(await executor.getStorage(0n, inner)).toBe(7n);
      expect(await executor.getStorage(0n, outer)).toBe(7n);

      expect(events.map(({ kind, frame }) => [kind, frame.depth])).toEqual([
        ["enter", 0],
        ["enter", 1],
        ["exit", 1],
        ["exit", 0],
      ]);
      const [enterOuter, enterInner] = events.map(({ frame }) => frame);
      expect(enterOuter).toMatchObject({ address: outer, caller: carol });
      expect(enterInner).toMatchObject({ address: inner, caller: outer });
      expect(bytesToHex(enterInner.calldata)).toBe(word(7n));
      const exit = events[2];
      expect(exit.kind === "exit" && bytesToHex(exit.returnData)).toBe(
        word(7n),
      );
      for (const step of steps) {
        expect(step.address).toBe(step.depth === 0 ? outer : inner);
      }
      const inside = steps.map(({ depth }) => depth === 1);
      const [, enterEvent, exitInner] = events;
      expect(enterEvent.kind === "enter" && enterEvent.first).toBe(
        inside.indexOf(true),
      );
      expect(exitInner.kind === "exit" && exitInner.last).toBe(
        inside.lastIndexOf(true),
      );
      expect(steps[0].op).toBe(0x60);
    });

    it("keeps the legacy deploy and execute", async () => {
      await executor.deploy(constructorCode);
      const steps: TraceStep[] = [];
      await executor.execute({}, (step) => steps.push(step));
      expect(await executor.getStorage(0n)).toBe(42n);
      expect(steps.map(({ opcode }) => opcode)).toEqual([
        "PUSH1",
        "PUSH1",
        "SSTORE",
        "STOP",
      ]);
    });

    it("sends value from funded accounts only", async () => {
      const result = await executor.deploy({
        from: alice,
        create: creation("00"),
        value: 5n,
      });
      expect(result.address).toBeDefined();

      const poor = "0x" + "dd".repeat(20);
      expect(
        (await executor.call({ from: poor, to: alice, value: 1n })).success,
      ).toBe(false);
    });
  });

  describe("gas", () => {
    it("gives each step's exact cost", async () => {
      const address = await deployed(executor, store);
      const steps: TraceStep[] = [];
      await executor.call({ from: alice, to: address, input: word(1n) }, (s) =>
        steps.push(s),
      );
      expect(steps.map(({ opcode, gasCost }) => [opcode, gasCost])).toEqual([
        ["PUSH1", 3n],
        ["CALLDATALOAD", 3n],
        ["DUP1", 3n],
        ["PUSH1", 3n],
        ["SSTORE", 22100n], // cold, zero to nonzero
        ["PUSH1", 3n],
        ["MSTORE", 6n], // with one word of memory expansion
        ["PUSH1", 3n],
        ["PUSH1", 3n],
        ["RETURN", 0n],
      ]);
      for (let i = 0; i + 1 < steps.length; i++) {
        expect(steps[i].gasRemaining - steps[i + 1].gasRemaining).toBe(
          steps[i].gasCost,
        );
      }
    });
  });

  describe("block", () => {
    // returns PREVRANDAO, NUMBER, TIMESTAMP, CHAINID, COINBASE, BASEFEE,
    // BLOBBASEFEE and the previous block's BLOCKHASH
    const blockCode = asm(`
      PREVRANDAO PUSH1 0 MSTORE   NUMBER PUSH1 32 MSTORE
      TIMESTAMP PUSH1 64 MSTORE   CHAINID PUSH1 96 MSTORE
      COINBASE PUSH1 128 MSTORE   BASEFEE PUSH1 160 MSTORE
      BLOBBASEFEE PUSH1 192 MSTORE
      PUSH1 1 NUMBER SUB BLOCKHASH PUSH1 224 MSTORE
      PUSH2 256 PUSH1 0 RETURN
    `);

    it("lets contracts read the block", async () => {
      executor = await funded(new Executor({ chainId: 31337n }));
      const address = await deployed(executor, blockCode);
      const block: BlockOptions = {
        number: 12n,
        timestamp: 1_700_000_000n,
        prevrandao: 0xabcdefn,
        coinbase: "0x" + "c0".repeat(20),
        baseFee: 7n,
      };
      const result = await executor.call({ from: alice, to: address, block });
      expect(bytesToHex(result.returnValue)).toBe(
        [0xabcdefn, 12n, 1_700_000_000n, 31337n, BigInt(block.coinbase!), 7n]
          .map((value) => word(value))
          .join("") +
          word(1n) +
          bytesToHex(keccak256(hexToBytes(word(11n)))),
      );
    });

    it("runs in a zero block without the option", async () => {
      await executor.deploy(
        creation(
          asm(`PREVRANDAO NUMBER TIMESTAMP PUSH1 0 MSTORE
          PUSH1 32 MSTORE PUSH1 64 MSTORE PUSH1 96 PUSH1 0 RETURN`),
        ),
      );
      const result = await executor.execute();
      expect(bytesToHex(result.returnValue)).toBe(word(0n).repeat(3));
    });
  });

  describe("transaction boundaries", () => {
    const sstoreCost = async (
      run: (trace: (step: TraceStep) => void) => Promise<unknown>,
    ) => {
      let cost: bigint | undefined;
      await run((step) => {
        if (step.opcode === "SSTORE") cost = step.gasCost;
      });
      return cost!;
    };

    it("clears transient storage between transactions", async () => {
      // stores TLOAD(1) at slot 0, then TSTORE(1, 42)
      const address = await deployed(
        executor,
        asm(`PUSH1 1 TLOAD PUSH1 0 SSTORE PUSH1 42 PUSH1 1 TSTORE`),
      );
      await executor.call({ from: alice, to: address });
      await executor.call({ from: bob, to: address });
      expect(await executor.getStorage(0n, address)).toBe(0n);
    });

    it("makes slots cold again after a transaction", async () => {
      const address = await deployed(executor, store);
      const costs: bigint[] = [];
      for (const from of [alice, bob]) {
        costs.push(
          await sstoreCost((step) =>
            executor.call({ from, to: address, input: word(1n) }, step),
          ),
        );
      }
      // same value again: a warm slot would cost 100
      expect(costs).toEqual([22100n, 2200n]);
    });

    it("resets slots' original values after a transaction", async () => {
      const address = await deployed(executor, store);
      await executor.call({ from: alice, to: address, input: word(1n) });
      const cost = await sstoreCost((step) =>
        executor.call({ from: alice, to: address, input: word(2n) }, step),
      );
      // cold (2100) + changing a clean nonzero slot (2900)
      expect(cost).toBe(5000n);
    });

    it("ends legacy executes only on request", async () => {
      await executor.deploy(creation(store));
      const run = () =>
        sstoreCost((step) => executor.execute({ data: word(1n) }, step));
      expect(await run()).toBe(22100n);
      expect(await run()).toBe(100n); // still warm
      await executor.endTransaction();
      expect(await run()).toBe(2200n);
    });
  });

  describe("errors", () => {
    it("rejects with a frame handler's error", async () => {
      const inner = await deployed(executor, store);
      const outer = await deployed(executor, forward(inner));
      const call = (fail: FrameEvent["kind"]) =>
        executor.call(
          { from: alice, to: outer, input: word(3n) },
          {
            frame: (event) => {
              if (event.kind === fail && event.frame.depth === 1) {
                throw new Error(`failed on ${fail}`);
              }
            },
          },
        );
      await expect(call("enter")).rejects.toThrow("failed on enter");
      await expect(call("exit")).rejects.toThrow("failed on exit");

      // the executor still works
      const result = await executor.call({
        from: alice,
        to: outer,
        input: word(4n),
      });
      expect(result.success).toBe(true);
      expect(await executor.getStorage(0n, inner)).toBe(4n);
    });

    it("rejects with a step handler's error", async () => {
      const address = await deployed(executor, store);
      await expect(
        executor.call({ from: alice, to: address }, () => {
          throw new Error("failed on step");
        }),
      ).rejects.toThrow("failed on step");
    });

    it("undoes a run that throws", async () => {
      // SSTORE, then BASEFEE, which throws in the zero block
      await executor.deploy(creation(asm(`PUSH1 9 PUSH1 0 SSTORE BASEFEE`)));
      await expect(executor.execute()).rejects.toThrow();
      expect(await executor.getStorage(0n)).toBe(0n);

      const result = await executor.execute({ block: { baseFee: 1n } });
      expect(result.success).toBe(true);
      expect(await executor.getStorage(0n)).toBe(9n);
    });
  });
});
