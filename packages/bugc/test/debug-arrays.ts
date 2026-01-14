import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { keccak256 } from "ethereum-cryptography/keccak";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const source = readFileSync(
    resolve(__dirname, "../../../examples/intermediate/arrays.bug"),
    "utf-8",
  );

  const compiler = buildSequence(bytecodeSequence);
  const result = await compiler.run({ source });

  if (!result.success) {
    console.log("Compilation failed");
    return;
  }

  const executor = new EvmExecutor();
  const { runtime, create } = result.value.bytecode;
  const hasCreate = create && create.length > 0;
  const createCode = hasCreate ? bytesToHex(create) : bytesToHex(runtime);

  await executor.deploy(createCode);
  await executor.execute({ data: "" });

  // Calculate keccak256(0) for array base
  const slotBytes = new Uint8Array(32);
  slotBytes[31] = 0;
  const hash = keccak256(slotBytes);
  const keccakSlot = BigInt("0x" + bytesToHex(hash));

  console.log("Checking keccak-based array storage:");
  let sum = 0n;
  for (let i = 0n; i < 10n; i++) {
    const val = await executor.getStorage(keccakSlot + i);
    console.log(`  numbers[${i}] at keccak(0)+${i}: ${val}`);
    sum += val;
  }
  console.log("Sum of array elements:", sum);

  // Check scalar values at their declared slots
  console.log("\nScalar storage (at declared slots):");
  console.log("  slot 1 (sum):", await executor.getStorage(1n));
  console.log("  slot 2 (max):", await executor.getStorage(2n));
  console.log("  slot 3 (count):", await executor.getStorage(3n));
  console.log("  slot 4 (found):", await executor.getStorage(4n));
  console.log("  slot 5 (searchValue):", await executor.getStorage(5n));
}

main().catch(console.error);
