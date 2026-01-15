import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";

async function main() {
  const source = `
name TestAddr;

storage {
  [0] val: uint256;
}

create {
  val = 123;
}

code {
  val = 456;
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

  console.log("Has create bytecode:", hasCreate);

  await executor.deploy(createCode);

  console.log("\nAfter deploy (should be 123):");
  console.log("  slot 0:", await executor.getStorage(0n));

  await executor.execute({ data: "" });

  console.log("\nAfter call (should be 456):");
  console.log("  slot 0:", await executor.getStorage(0n));
}

main().catch(console.error);
