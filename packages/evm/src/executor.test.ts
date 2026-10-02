import { describe, it, expect, beforeEach } from "vitest";
import { bytesToHex } from "ethereum-cryptography/utils";
import { Executor } from "#executor";

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
