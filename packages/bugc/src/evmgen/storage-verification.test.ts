import { describe, it, expect } from "vitest";
import { compile } from "#compiler";

describe.skip("Storage verification (requires local Ethereum node)", () => {
  it("should store array values correctly in constructor", async () => {
    const source = `
      name ConstructorArray;

      storage {
        [0] items: array<uint256, 3>;
      }

      create {
        items[0] = 1005;
        items[1] = 1006;
        items[2] = 1007;
      }

      code {}
    `;

    const result = await compile({ to: "bytecode", source });
    expect(result.success).toBe(true);

    if (!result.success) return;

    const { create: creationBytecode } = result.value.bytecode;
    expect(creationBytecode).toBeDefined();

    // Deploy and check storage
    const deployResponse = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_sendTransaction",
        params: [
          {
            from: "0xa0e20c11276b8ab803a7034d0945797afb4d060b",
            data: "0x" + Buffer.from(creationBytecode!).toString("hex"),
            gas: "0x100000",
          },
        ],
        id: 1,
      }),
    });

    const deployResult = await deployResponse.json();
    const txHash = deployResult.result;

    // Get receipt to find contract address
    const receiptResponse = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 2,
      }),
    });

    const receipt = await receiptResponse.json();
    const contractAddress = receipt.result.contractAddress;

    // Check storage slots
    const expectedValues = [
      { slot: "0x0", value: 1005 },
      { slot: "0x1", value: 1006 },
      { slot: "0x2", value: 1007 },
    ];

    for (const { slot, value } of expectedValues) {
      const storageResponse = await fetch("http://localhost:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getStorageAt",
          params: [contractAddress, slot, "latest"],
          id: 3,
        }),
      });

      const storageResult = await storageResponse.json();
      const storedValue = BigInt(storageResult.result);

      expect(storedValue).toBe(BigInt(value));
    }
  });

  it("should store direct storage values correctly", async () => {
    const source = `
      name DirectStorage;

      storage {
        [0] a: uint256;
        [1] b: uint256;
        [2] c: uint256;
      }

      create {
        a = 100;
        b = 200;
        c = 300;
      }

      code {}
    `;

    const result = await compile({ to: "bytecode", source });
    expect(result.success).toBe(true);

    if (!result.success) return;

    const { create: creationBytecode } = result.value.bytecode;

    // Deploy
    const deployResponse = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_sendTransaction",
        params: [
          {
            from: "0xa0e20c11276b8ab803a7034d0945797afb4d060b",
            data: "0x" + Buffer.from(creationBytecode!).toString("hex"),
            gas: "0x100000",
          },
        ],
        id: 1,
      }),
    });

    const deployResult = await deployResponse.json();
    const txHash = deployResult.result;

    // Get receipt
    const receiptResponse = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 2,
      }),
    });

    const receipt = await receiptResponse.json();
    const contractAddress = receipt.result.contractAddress;

    // Check storage slots
    const expectedValues = [
      { slot: "0x0", value: 100 },
      { slot: "0x1", value: 200 },
      { slot: "0x2", value: 300 },
    ];

    for (const { slot, value } of expectedValues) {
      const storageResponse = await fetch("http://localhost:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getStorageAt",
          params: [contractAddress, slot, "latest"],
          id: 3,
        }),
      });

      const storageResult = await storageResponse.json();
      const storedValue = BigInt(storageResult.result);

      expect(storedValue).toBe(BigInt(value));
    }
  });
});
