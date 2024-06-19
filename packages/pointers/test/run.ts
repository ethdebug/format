import chalk from "chalk";
import { highlight } from "cli-highlight";
import { describeSchema } from "@ethdebug/format";

import { Data } from "../src/data.js";
import type { Pointer } from "../src/pointer.js";
import { dereference } from "../src/index.js";

import { loadGanache, machineForProvider } from "./ganache.js";
import { deployContract } from "./deploy.js";
import { compileCreateBytecode } from "./solc.js";
import { examples } from "./examples.js";

const {
  schema: pointerSchema
} = describeSchema({
  schema: { id: "schema:ethdebug/format/pointer" },
}) as { schema: { examples: Pointer[] } };

const stringStoragePointer: Pointer =
  pointerSchema.examples.find(
    example => JSON.stringify(example).includes("long-string-length-data")
  )!;

export async function run() {
  console.log(
    chalk.bold(chalk.cyan(
      "demo: run compiled solidity and watch a changing ethdebug/format pointer\n"
    ))
  );

  console.group(chalk.bold("ethdebug/format pointer used by demo"));
  console.log(
    highlight(
      describeSchema({
        schema: { id: "schema:ethdebug/format/pointer" },
        pointer: "#/examples/4"
      }).yaml,
      { language: "yaml" }
    ).trim()
  );
  console.groupEnd();
  console.log("");

  console.group(chalk.bold("solidity source code used by demo"));
  console.log(
    examples.stringStorage.sources["StringStorage.sol"].content.trim()
  );
  console.groupEnd();
  console.log("");

  console.group(chalk.bold("preparing demo"));

  const provider = (await loadGanache()).provider({
    logging: {
      quiet: true
    }
  });

  const bytecode = await compileCreateBytecode(examples.stringStorage);
  console.log("- compiled source code.");

  const {
    transactionHash,
    contractAddress
  } = await deployContract(bytecode, provider);
  console.log("- deployed contract.");

  const machine = machineForProvider(provider, { transactionHash });

  const trace = machine.trace();
  console.log("- requested trace.");

  console.groupEnd();
  console.log("");

  console.group(chalk.bold("watching trace for changing pointer values"));

  const cursor = await dereference(stringStoragePointer);
  let currentStoredString;
  for await (const state of trace) {
    const { regions, read } = await cursor.view(state);
    const stringData = Data.fromHex(
      await regions.named("string")
        .map(read)
        // HACK concatenate via string representation
        .map(async data => (await data).toHex().slice(2))
        .reduce(async (accumulator, data) => {
          return `${await accumulator}${await data}`;
        }, Promise.resolve("0x"))
    );

    const storedString = new TextDecoder().decode(stringData);

    if (storedString !== currentStoredString) {
      const pc = Number(await state.programCounter);
      console.group(chalk.bold(
        pc === 0 ?
          "initial storedString"
          : "storedString changed"
      ));
      console.log("pc: %o", pc);
      console.log("new value: %o", storedString);
      console.groupEnd();

      currentStoredString = storedString;
    }
  }

  console.groupEnd();
  console.log("");

  console.log(chalk.bold("thanks for reading!"));

}

await run();
