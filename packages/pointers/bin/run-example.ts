import chalk from "chalk";
import { highlight } from "cli-highlight";
import { describeSchema } from "@ethdebug/format";

import {
  type Cursor,
  Data
} from "../src/index.js";

import { observeTrace } from "../test/index.js";

import { observeTraceTests } from "../src/test-cases.js";

export async function run() {
  const {
    pointer,
    compileOptions,
    observe
  } = observeTraceTests["string storage"];

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
