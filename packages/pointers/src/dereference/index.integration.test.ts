import { jest, expect, describe, it, beforeEach } from "@jest/globals";

import { describeSchema } from "@ethdebug/format";

import {
  loadGanache,
  machineForProvider,
  compileCreateBytecode,
  deployContract,
  examples
} from "../../test/index.js";

import { Machine, Data, type Pointer, dereference } from "../index.js";

const { schema: { examples: examplePointers } } = describeSchema({
  schema: { id: "schema:ethdebug/format/pointer" }
}) as { schema: { examples: Pointer[] } };

describe("dereference (integration)", () => {
  describe("solidity string storage", () => {
    it("allows dereferencing solidity string storage pointers", async () => {
      const expectedStringValues = [
        "",
        "hello world",
        "solidity storage is a fun lesson in endianness"
      ];
      const observedStringValues = [];

      const pointer: Pointer = examplePointers.find(
        example => JSON.stringify(example).includes("long-string-length-data")
      )!;

      // initialize local development blockchain
      const provider = (await loadGanache()).provider({
        logging: {
          quiet: true
        }
      });

      const bytecode = await compileCreateBytecode(examples.stringStorage);
      const {
        transactionHash,
        contractAddress
      } = await deployContract(bytecode, provider);

      const machine = machineForProvider(provider);
      const trace = machine.trace(transactionHash);

      let cursor = await dereference(pointer);
      let lastObservedStringValue;
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

        if (storedString !== lastObservedStringValue) {
          observedStringValues.push(storedString);
          lastObservedStringValue = storedString;
        }
      }

      expect(observedStringValues).toEqual(
        expect.arrayContaining(expectedStringValues)
      );

    });
  });
});
