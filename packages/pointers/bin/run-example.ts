import chalk from "chalk";
import { highlight } from "cli-highlight";
import { describeSchema } from "@ethdebug/format";

import {
  type Cursor,
  Data
} from "../src/index.js";

import {
  prepareCompileOptions,
  findExamplePointer,
  observeTrace,
  type ObserveTraceOptions
} from "../test/index.js";

const pointer = findExamplePointer("string-storage-contract-variable-slot");

const compileOptions = prepareCompileOptions({
  path: "StringStorage.sol",
  contractName: "StringStorage",
  content: `contract StringStorage {
    string storedString;
    bool done;

    event Done();

    constructor() {
      storedString = "hello world";
      storedString = "solidity storage is a fun lesson in endianness";

      done = true;
    }
  }
  `
});

const observe = async ({ regions, read }: Cursor.View): Promise<string> => {
  const strings = await regions.named("string");
  const stringData: Data = Data.zero().concat(
    ...await Promise.all(strings.map(read))
  );

  return new TextDecoder().decode(stringData);
};

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
    compileOptions.sources["StringStorage.sol"].content.trim()
  );
  console.groupEnd();
  console.log("");

  console.group(chalk.bold("observing deployment trace"));

  const observedValues =
    await observeTrace({ pointer, compileOptions, observe });

  console.groupEnd();
  console.log("");

  console.group(chalk.bold("observed values:"));
  for (const value of observedValues) {
    console.log("- %o", value);
  }
  console.groupEnd();
  console.log("");
}

await run();
