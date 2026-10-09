/**
 * Machine.State Adapter
 *
 * Implements the @ethdebug/pointers Machine.State interface over a
 * complete step state, to enable pointer evaluation at a trace step.
 */

import type { Machine } from "@ethdebug/pointers";
import { Data } from "@ethdebug/pointers";
import type { StepState } from "#trace";

/**
 * What ran at the step, for a Machine.State. Each defaults to the
 * state's own (`state.at`, from a trace), else to 0, "STOP" and 0.
 */
export interface MachineStateOptions {
  pc?: number | bigint;
  /** Opcode name */
  opcode?: string;
  /** Trace index (step number) */
  traceIndex?: number | bigint;
}

/**
 * Create a Machine.State that reads the given step state, and only
 * it: get one from `Trace.stateAt` for a step of a trace, or from
 * `Executor.currentState` for the executor's state now.
 *
 * @param state - The complete state at the step
 * @param options - Program counter, opcode and trace index
 */
export function createMachineState(
  state: StepState,
  options: MachineStateOptions = {},
): Machine.State {
  const {
    pc = state.at?.pc ?? 0,
    opcode = state.at?.opcode ?? "STOP",
    traceIndex = state.at?.traceIndex ?? 0,
  } = options;
  const { stack } = state;

  return {
    traceIndex: Promise.resolve(BigInt(traceIndex)),
    programCounter: Promise.resolve(BigInt(pc)),
    opcode: Promise.resolve(opcode),

    stack: {
      length: Promise.resolve(BigInt(stack.length)),
      async peek({ depth, slice }): Promise<Data> {
        const index = stack.length - 1 - Number(depth);
        if (index < 0 || index >= stack.length) {
          return Data.zero();
        }
        return sliceWord(stack[index], slice);
      },
    },

    memory: bytesRegion(state.memory),

    storage: {
      async read({ slot, slice }): Promise<Data> {
        return sliceWord(await state.storage(slot.asUint()), slice);
      },
    },

    calldata: bytesRegion(state.calldata),

    returndata: bytesRegion(state.returndata),

    code: bytesRegion(state.code),

    transient: {
      async read({ slot, slice }): Promise<Data> {
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
 * A byte region (memory, calldata, returndata, code) over the given
 * bytes. Reads past the end are zero, as in the EVM.
 */
function bytesRegion(bytes: Uint8Array): {
  length: Promise<bigint>;
  read(options: { slice: Slice }): Promise<Data>;
} {
  return {
    length: Promise.resolve(BigInt(bytes.length)),
    async read({ slice }): Promise<Data> {
      const offset = Number(slice.offset);
      const length = Number(slice.length);
      const out = new Uint8Array(length);
      out.set(bytes.subarray(offset, offset + length));
      return Data.fromBytes(out);
    },
  };
}
