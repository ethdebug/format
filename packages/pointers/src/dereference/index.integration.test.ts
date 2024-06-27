import { jest, expect, describe, it, beforeEach } from "@jest/globals";
import {
  prepareCompileOptions,
  findExamplePointer,
  observeTrace,
  type ObserveTraceOptions
} from "../../test/index.js";
import { type Cursor, Data } from "../index.js";

export interface ObserveTraceTest<V> extends ObserveTraceOptions<V> {
  expectedValues: V[];
}

export type ObserveTraceTests<M extends { [name: string]: any }> = {
  [K in keyof M]: ObserveTraceTest<M[K]>;
}

/**
 * collection of descriptions of tests that compile+deploy Solidity code,
 * then step through the machine trace of that code's execution, watching
 * and recording a pointer's value over the course of that trace.
 *
 * tests are described in terms of an expected sequence of values which the
 * list of observed values should contain by the end of the trace, allowing
 * for additional unexpected values in between and around the expected values.
 */
export const observeTraceTests: ObserveTraceTests<{
  "storage string": string;
}> = {
  "storage string": {
    pointer: findExamplePointer("string-storage-contract-variable-slot"),

    compileOptions: prepareCompileOptions({
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
    }),

    expectedValues: [
      "",
      "hello world",
      "solidity storage is a fun lesson in endianness"
    ],

    async observe({ regions, read }: Cursor.View): Promise<string> {
      const strings = await regions.named("string");
      const stringData: Data = Data.zero().concat(
        ...await Promise.all(strings.map(read))
      );

      return new TextDecoder().decode(stringData);
    },
  }
};

describe("dereference (integration)", () => {
  describe("changing pointer values over the course of a trace", () => {
    for (const [name, test] of Object.entries(observeTraceTests)) {
      const {
        pointer,
        compileOptions,
        observe,
        expectedValues
      } = test;

      describe(`example pointer: ${name}`, () => {
        it("resolves to values containing the expected sequence", async () => {
          const observedValues = await observeTrace({
            pointer,
            compileOptions,
            observe
          });

          expect(observedValues).toEqual(
            expect.arrayContaining(expectedValues)
          );
        });
      });
    }
  });
});
