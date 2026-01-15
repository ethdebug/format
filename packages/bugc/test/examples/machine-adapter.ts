/**
 * Machine.State Adapter for EvmExecutor
 *
 * Implements the @ethdebug/pointers Machine.State interface
 * wrapping our EvmExecutor for pointer evaluation.
 */

import type { Machine } from "@ethdebug/pointers";
import { Data } from "@ethdebug/pointers";
import type { EvmExecutor } from "../evm/index.js";

/**
 * Create a Machine.State from an EvmExecutor.
 *
 * This adapter allows using @ethdebug/pointers dereference()
 * to evaluate pointers against our EVM executor's storage state.
 *
 * Note: Only storage is fully implemented. Stack, memory, etc.
 * return empty/zero values since we only have end-state access.
 */
export function createMachineState(executor: EvmExecutor): Machine.State {
  return {
    // Trace info (not meaningful for end-state)
    traceIndex: Promise.resolve(0n),
    programCounter: Promise.resolve(0n),
    opcode: Promise.resolve("STOP"),

    // Stack - not available in end-state
    stack: {
      length: Promise.resolve(0n),
      peek: async (): Promise<Data> => Data.zero(),
    },

    // Memory - not available in end-state
    memory: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Storage - fully implemented via executor
    storage: {
      async read({ slot, slice }): Promise<Data> {
        const slotValue = slot.asUint();
        const value = await executor.getStorage(slotValue);
        const data = Data.fromUint(value);

        if (slice) {
          const padded = data.padUntilAtLeast(32);
          const sliced = new Uint8Array(padded).slice(
            Number(slice.offset),
            Number(slice.offset + slice.length),
          );
          return Data.fromBytes(sliced);
        }

        return data.padUntilAtLeast(32);
      },
    },

    // Calldata - not available
    calldata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Returndata - not available
    returndata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Code - not available
    code: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Transient storage - not available
    transient: {
      read: async (): Promise<Data> => Data.zero(),
    },
  };
}
