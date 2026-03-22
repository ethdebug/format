import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";
import { keccak256 } from "ethereum-cryptography/keccak";

async function main() {
  // Simpler test case
  const source = `
name SimpleArrayTest;

storage {
  [0] arr: array<uint256, 5>;
  [10] result: uint256;
}

code {
  arr[0] = 100;
  arr[1] = 200;
  result = 42;
}
`;

  const compiler = buildSequence(bytecodeSequence);
  const result = await compiler.run({ source });

  if (!result.success) {
    console.log("Compilation failed:", result);
    return;
  }

  const executor = new EvmExecutor();
  const { runtime, create } = result.value.bytecode;
  const hasCreate = create && create.length > 0;
  const createCode = hasCreate ? bytesToHex(create) : bytesToHex(runtime);

  await executor.deploy(createCode);
  await executor.execute({ data: "" });

  // Calculate keccak256(0) - slot for dynamic array element 0
  const slotBytes = new Uint8Array(32);
  slotBytes[31] = 0; // slot 0
  const hash = keccak256(slotBytes);
  const keccakSlot = BigInt("0x" + bytesToHex(hash));

  console.log("keccak256(0) =", keccakSlot.toString(16));

  // Check storage at keccak256(0) slots
  console.log("\nStorage at keccak-based slots:");
  console.log(
    "  keccak256(0) + 0:",
    await executor.getStorage(keccakSlot + 0n),
  );
  console.log(
    "  keccak256(0) + 1:",
    await executor.getStorage(keccakSlot + 1n),
  );

  // Also check result
  console.log("\nSlot 10 (result):", await executor.getStorage(10n));
}

main().catch(console.error);
