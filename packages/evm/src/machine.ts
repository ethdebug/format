/**
 * Machine.State Adapter
 *
 * Implements the @ethdebug/pointers Machine.State interface
 * to enable pointer evaluation against EVM executor state.
 */

import type { Machine } from "@ethdebug/pointers";
import { Data } from "@ethdebug/pointers";
import type { Executor } from "#executor";
import type { TraceStep } from "#trace";

/**
 * Options for creating a Machine.State adapter.
 */
export interface MachineStateOptions {
  /** A captured trace step to read stack/memory from */
  traceStep?: TraceStep;
  /** Program counter (overrides traceStep.pc if set) */
  programCounter?: bigint;
  /** Opcode (overrides traceStep.opcode if set) */
  opcode?: string;
  /** Trace index (step number) */
  traceIndex?: bigint;
}

/**
 * Create a Machine.State from an Executor.
 *
 * When a traceStep is provided, stack and memory reads
 * use the captured step data. Without a traceStep, only
 * storage is functional (end-state adapter).
 *
 * @param executor - EVM executor to read storage/code from
 * @param options - Trace step and context overrides
 */
export function createMachineState(
  executor: Executor,
  options: MachineStateOptions = {},
): Machine.State {
  const { traceStep, traceIndex = 0n } = options;

  const programCounter = options.programCounter
    ?? (traceStep ? BigInt(traceStep.pc) : 0n);
  const opcode = options.opcode
    ?? (traceStep ? traceStep.opcode : "STOP");

  return {
    traceIndex: Promise.resolve(traceIndex),
    programCounter: Promise.resolve(programCounter),
    opcode: Promise.resolve(opcode),

    stack: {
      length: Promise.resolve(
        traceStep ? BigInt(traceStep.stack.length) : 0n,
      ),
      async peek({ depth, slice }): Promise<Data> {
        if (!traceStep) {
          return Data.zero();
        }

        const { stack } = traceStep;
        const index = stack.length - 1 - Number(depth);
        if (index < 0 || index >= stack.length) {
          return Data.zero();
        }

        const data = Data.fromUint(stack[index])
          .padUntilAtLeast(32);

        if (slice) {
          const sliced = new Uint8Array(data).slice(
            Number(slice.offset),
            Number(slice.offset + slice.length),
          );
          return Data.fromBytes(sliced);
        }

        return data;
      },
    },

    memory: {
      length: Promise.resolve(
        traceStep?.memory
          ? BigInt(traceStep.memory.length)
          : 0n,
      ),
      async read({ slice }): Promise<Data> {
        if (!traceStep?.memory) {
          return Data.zero();
        }

        const sliced = traceStep.memory.slice(
          Number(slice.offset),
          Number(slice.offset + slice.length),
        );
        return Data.fromBytes(sliced);
      },
    },

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

    calldata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    returndata: {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    },

    code: {
      length: (async () => {
        const code = await executor.getCode();
        return BigInt(code.length);
      })(),
      async read({ slice }): Promise<Data> {
        const code = await executor.getCode();
        const sliced = code.slice(
          Number(slice.offset),
          Number(slice.offset + slice.length),
        );
        return Data.fromBytes(sliced);
      },
    },

    transient: {
      read: async (): Promise<Data> => Data.zero(),
    },
  };
}
