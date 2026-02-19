/**
 * Machine.State Adapter
 *
 * Implements the @ethdebug/pointers Machine.State interface
 * to enable pointer evaluation against EVM executor state.
 */

import type { Machine } from "@ethdebug/pointers";
import { Data } from "@ethdebug/pointers";
import type { Executor } from "#executor";

/**
 * Options for creating a Machine.State adapter.
 */
export interface MachineStateOptions {
  /** Program counter for the current state */
  programCounter?: bigint;
  /** Opcode at the current program counter */
  opcode?: string;
  /** Trace index (step number) */
  traceIndex?: bigint;
}

/**
 * Create a Machine.State from an Executor.
 *
 * This adapter allows using @ethdebug/pointers dereference()
 * to evaluate pointers against an EVM executor's storage state.
 *
 * Note: This creates an "end-state" adapter where only storage
 * is fully implemented. Stack, memory, etc. return empty/zero
 * values since we only have post-execution state access.
 *
 * @param executor - The EVM executor to read state from
 * @param options - Optional state context (PC, opcode, trace index)
 * @returns A Machine.State suitable for pointer dereferencing
 */
export function createMachineState(
  executor: Executor,
  options: MachineStateOptions = {},
): Machine.State {
  const { programCounter = 0n, opcode = "STOP", traceIndex = 0n } = options;

  return {
    // Trace context
    traceIndex: Promise.resolve(traceIndex),
    programCounter: Promise.resolve(programCounter),
    opcode: Promise.resolve(opcode),

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

    // Calldata - not available in end-state
    calldata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Returndata - not available in end-state
    returndata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Code - not available in end-state
    code: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    // Transient storage - not available in end-state
    transient: {
      read: async (): Promise<Data> => Data.zero(),
    },
  };
}
