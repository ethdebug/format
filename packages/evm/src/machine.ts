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
  /**
   * State at the trace step, from the caller (for example, recorded
   * while tracing). Each part given here is read instead of the
   * executor's current state; parts left out keep the default.
   */
  state?: StepState;
}

/**
 * State at one trace step that a trace step itself does not carry.
 */
export interface StepState {
  /** Storage of the step's contract, by slot */
  storage?: (slot: bigint) => bigint | Promise<bigint>;
  /** Transient storage of the step's contract, by slot */
  transient?: (slot: bigint) => bigint | Promise<bigint>;
  /** The step's frame's calldata */
  calldata?: Uint8Array;
  /** Return data of the frame's last completed call */
  returndata?: Uint8Array;
  /** Code the step's frame runs */
  code?: Uint8Array;
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
  const { traceStep, traceIndex = 0n, state } = options;

  const programCounter =
    options.programCounter ?? (traceStep ? BigInt(traceStep.pc) : 0n);
  const opcode = options.opcode ?? (traceStep ? traceStep.opcode : "STOP");

  return {
    traceIndex: Promise.resolve(traceIndex),
    programCounter: Promise.resolve(programCounter),
    opcode: Promise.resolve(opcode),

    stack: {
      length: Promise.resolve(traceStep ? BigInt(traceStep.stack.length) : 0n),
      async peek({ depth, slice }): Promise<Data> {
        if (!traceStep) {
          return Data.zero();
        }

        const { stack } = traceStep;
        const index = stack.length - 1 - Number(depth);
        if (index < 0 || index >= stack.length) {
          return Data.zero();
        }

        const data = Data.fromUint(stack[index]).padUntilAtLeast(32);

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
        traceStep?.memory ? BigInt(traceStep.memory.length) : 0n,
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
        const value = state?.storage
          ? await state.storage(slotValue)
          : await executor.getStorage(slotValue);
        return sliceWord(value, slice);
      },
    },

    calldata: bytesRegion(state?.calldata),

    returndata: bytesRegion(state?.returndata),

    code: state?.code
      ? bytesRegion(state.code)
      : {
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
      async read({ slot, slice }): Promise<Data> {
        if (!state?.transient) {
          return Data.zero();
        }
        return sliceWord(await state.transient(slot.asUint()), slice);
      },
    },
  };
}

interface Slice {
  offset: bigint;
  length: bigint;
}

function sliceWord(value: bigint, slice?: Slice): Data {
  const padded = Data.fromUint(value).padUntilAtLeast(32);
  if (!slice) {
    return padded;
  }
  return Data.fromBytes(
    new Uint8Array(padded).slice(
      Number(slice.offset),
      Number(slice.offset + slice.length),
    ),
  );
}

/**
 * A byte region (calldata, returndata, code) over the given bytes;
 * empty (length zero, reads zero) when absent.
 */
function bytesRegion(bytes?: Uint8Array): {
  length: Promise<bigint>;
  read(options: { slice: Slice }): Promise<Data>;
} {
  if (!bytes) {
    return {
      length: Promise.resolve(0n),
      read: async (): Promise<Data> => Data.zero(),
    };
  }
  return {
    length: Promise.resolve(BigInt(bytes.length)),
    async read({ slice }): Promise<Data> {
      const offset = Number(slice.offset);
      const length = Number(slice.length);
      // reads past the end are zero, as in the EVM
      const out = new Uint8Array(length);
      out.set(bytes.subarray(offset, offset + length));
      return Data.fromBytes(out);
    },
  };
}
