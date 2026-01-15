import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";

async function main() {
  const source = `
name LoopCreate;

storage {
  [0] counter: uint256;
}

create {
  counter = 0;
  for (let i = 0; i < 5; i = i + 1) {
    counter = counter + 1;
  }
}
`;

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

  console.log("Create bytecode:", createCode);

  await executor.deploy(createCode);

  console.log("\nAfter deploy (should be 5):");
  console.log("  slot 0 (counter):", await executor.getStorage(0n));
}

main().catch(console.error);
