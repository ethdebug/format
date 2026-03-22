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
    resolve(__dirname, "../../../examples/basic/array-length.bug"),
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

  console.log("Has create bytecode:", hasCreate);

  await executor.deploy(createCode);

  // Calculate keccak256(0) for array base
  const slotBytes = new Uint8Array(32);
  slotBytes[31] = 0;
  const hash = keccak256(slotBytes);
  const keccakSlot = BigInt("0x" + bytesToHex(hash));

  console.log(
    "\nArray elements after DEPLOY (should be 0,2,4,6,8,10,12,14,16,18):",
  );
  for (let i = 0n; i < 10n; i++) {
    const val = await executor.getStorage(keccakSlot + i);
    console.log(`  fixedArray[${i}]: ${val}`);
  }

  console.log("\nScalar values:");
  console.log("  arraySize (slot 1):", await executor.getStorage(1n));
}

main().catch(console.error);
