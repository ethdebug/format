import { bytecodeSequence, buildSequence } from "../src/compiler/index.js";
import { EvmExecutor } from "./evm/index.js";
import { bytesToHex } from "ethereum-cryptography/utils";

async function main() {
  const source = `
name SimpleLoop;

storage {
  [0] counter: uint256;
  [1] result: uint256;
}

code {
  counter = 0;
  result = 99;
  
  for (let i = 0; i < 5; i = i + 1) {
    counter = counter + 1;
  }
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

  console.log("Bytecode:", bytesToHex(create ?? runtime));

  await executor.deploy(createCode);
  await executor.execute({ data: "" });

  console.log("\nStorage after call:");
  console.log(
    "  slot 0 (counter):",
    await executor.getStorage(0n),
    "(expected: 5)",
  );
  console.log(
    "  slot 1 (result):",
    await executor.getStorage(1n),
    "(expected: 99)",
  );
}

main().catch(console.error);
