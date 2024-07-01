import {
  singleSourceCompilation,
  findExamplePointer,
  type ObserveTraceOptions
} from "../test/index.js";
import { type Cursor, Data } from "./index.js";

export interface ObserveTraceTest<V> extends ObserveTraceOptions<V> {
  expectedValues: V[];
}

const stringStorageTest: ObserveTraceTest<string> = {
  pointer: findExamplePointer("string-storage-contract-variable-slot"),

  compileOptions: singleSourceCompilation({
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
    // collect all the regions corresponding to string contents
    const strings = await regions.named("string");

    // read each region and concatenate all the bytes
    const stringData: Data = Data.zero()
      .concat(...await Promise.all(strings.map(read)));

    // decode into JS string
    return new TextDecoder().decode(stringData);
  },
};

const uint256ArrayMemoryTest: ObserveTraceTest<number[]> = {
  pointer: findExamplePointer("uint256-array-memory-pointer-slot"),
  compileOptions: singleSourceCompilation({
    path: "Uint256Arraymemory.sol",
    contractName: "Uint256ArrayMemory",
    content: `contract Uint256ArrayMemory {
      constructor() {
        uint256[] memory values = new uint256[](0);
        values = appendToArray(values, 1);
        values = appendToArray(values, 2);
        values = appendToArray(values, 3);
      }

      function appendToArray(
        uint256[] memory arr,
        uint256 value
      )
        private
        pure
        returns (uint256[] memory)
      {
        uint256[] memory newArray = new uint256[](arr.length + 1);

        for (uint i = 0; i < arr.length; i++) {
          newArray[i] = arr[i];
        }

        newArray[arr.length] = value;
        return newArray;
      }
    }
    `
  }),

  expectedValues: [
    [],
    [1],
    [1, 2],
    [1, 2, 3]
  ],

  async observe({ regions, read }, state): Promise<number[]> {
    const items = regions.named("array-item");

    return (await Promise.all(
      items.map(async (item) => {
        const data = await read(item);

        return Number(data.asUint());
      })
    ));
  },

  equals(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    for (const [index, value] of a.entries()) {
      if (b[index] !== value) {
        return false;
      }
    }

    return true;
  },

  // this function uses observation of solc + viaIR behavior to determine
  // that the memory array we're looking for is going to have a pointer at
  // the bottom of the stack
  //
  // also include a check to exclude observation when that bottom stack value
  // would have `cursor.view()` yield more regions than expected
  async shouldObserve(state) {
    const stackLength = await state.stack.length;
    if (stackLength === 0n) {
      return false;
    }

    // only consider the bottom of the stack
    const arrayOffset = await state.stack.peek({ depth: stackLength - 1n });

    const arrayCount = await state.memory.read({
      slice: {
        offset: arrayOffset.asUint(),
        length: 32n
      }
    })

    // the example code only appends three times
    return arrayCount.asUint() < 4n;
  }
};

/**
 * collection of descriptions of tests that compile+deploy Solidity code,
 * then step through the machine trace of that code's execution, watching
 * and recording a pointer's value over the course of that trace.
 *
 * tests are described in terms of an expected sequence of values which the
 * list of observed values should contain by the end of the trace, allowing
 * for additional unexpected values in between and around the expected values.
 */
export const observeTraceTests = {
  "string storage": stringStorageTest,
  "uint256[] memory": uint256ArrayMemoryTest,
};
