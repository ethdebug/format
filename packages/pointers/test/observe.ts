import { type Machine, type Pointer, type Cursor, dereference } from "../src/index.js";

import { loadGanache, machineForProvider } from "./ganache.js";
import { compileCreateBytecode, type CompileOptions } from "./solc.js";
import { deployContract } from "./deploy.js";

export interface ObserveTraceOptions<V> {
  pointer: Pointer;
  compileOptions: CompileOptions;
  observe({ regions, read }: Cursor.View, state: Machine.State): Promise<V>;
  equals?(a: V, b: V): boolean;
  shouldObserve?(state: Machine.State): Promise<boolean>;
}

/**
 * This function performs the steps necessary to setup and watch the code
 * execution of the given contract's deployment.
 *
 * This function tracks the changes to the given pointer's dereferenced cursor
 * by invoking the given `observe()` function to obtain a single primitive
 * result of type `V`.
 *
 * Upon reaching the end of the trace for this code execution, this function
 * then returns an ordered list of all the observed values, removing sequential
 * duplicates (using the defined `equals` function if it exists or just `===`).
 */
export async function observeTrace<V>({
  pointer,
  compileOptions,
  observe,
  equals = (a, b) => a === b,
  shouldObserve = () => Promise.resolve(true)
}: ObserveTraceOptions<V>): Promise<V[]> {
  const observedValues: V[] = [];

  // initialize local development blockchain
  const provider = (await loadGanache()).provider({
    logging: {
      quiet: true
    }
  });

  // perform compilation
  const bytecode = await compileCreateBytecode(compileOptions);

  // deploy contract
  const { transactionHash } = await deployContract(bytecode, provider);

  // prepare to inspect the EVM for that deployment transaction
  const machine = machineForProvider(provider, { transactionHash });

  let cursor; // delay initialization until first state of trace
  let lastObservedValue;
  for await (const state of machine.trace()) {
    if (!await shouldObserve(state)) {
      continue;
    }

    if (!cursor) {
      cursor = await dereference(pointer, { state });
    }

    const { regions, read } = await cursor.view(state);
    const observedValue = await observe({ regions, read }, state);

    if (
      typeof lastObservedValue === "undefined" ||
      !equals(observedValue, lastObservedValue)
    ) {
      observedValues.push(observedValue);
      lastObservedValue = observedValue;
    }
  }

  return observedValues;
}
