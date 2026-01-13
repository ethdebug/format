import { expect } from "vitest";
import chalk from "chalk";

expect.extend({
  toSatisfy<T, P extends (value: unknown) => value is T>(
    predicate: P,
    received: any,
  ) {
    const pass = predicate(received);

    return {
      pass,
      message: () =>
        `expected ${JSON.stringify(received)} ${
          pass ? "not to satisfy" : "to satisfy"
        } the predicate ${predicate.name}`,
    };
  },

  toSatisfyAll<T, P extends (value: unknown) => value is T>(
    predicate: P,
    values: any[],
  ) {
    const results = values.map((value) => ({
      value,
      pass: predicate(value),
    }));

    const pass = results.every((result) => result.pass);

    return {
      pass,
      message: () =>
        `expected the predicate ${predicate.name} ${
          pass ? "not to be satisfied by all" : "to be satisfied by all"
        } of the following values:\n${results
          .map(
            (result) =>
              `  ${result.pass ? chalk.green("✓") : chalk.red("✗")} ${
                // @ts-expect-error this.utils exists in vitest matcher context
                this.utils.printReceived(result.value)
              }`,
          )
          .join("\n")}`,
    };
  },
});
