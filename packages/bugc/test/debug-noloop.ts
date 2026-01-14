import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";

async function main() {
  const source = `
name NoLoop;

storage {
  [0] a: uint256;
  [1] b: uint256;
  [2] c: uint256;
}

code {
  a = 10;
  b = 20;
  c = a + b;
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

  console.log("\nStorage after call:");
  console.log("  slot 0 (a):", await executor.getStorage(0n), "(expected: 10)");
  console.log("  slot 1 (b):", await executor.getStorage(1n), "(expected: 20)");
  console.log("  slot 2 (c):", await executor.getStorage(2n), "(expected: 30)");
}

main().catch(console.error);
