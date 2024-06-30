import type { EthereumProvider } from "ganache";

import { Machine } from "../src/machine.js";
import { Data } from "../src/data.js";

export async function loadGanache() {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (
      args.length > 0 &&
      typeof args[0] === "string" &&
      args[0].includes("bigint: Failed to load bindings")
    ) {
      return;
    }

    originalWarn(...args);
  };

  const { default: Ganache } = await import("ganache");

  console.warn = originalWarn;
  return Ganache;
}

export interface MachineForProviderOptions {
  transactionHash: Data;
}

export function machineForProvider(
  provider: EthereumProvider,
  { transactionHash }: MachineForProviderOptions
): Machine {
  return {
    trace(): AsyncIterable<Machine.State> {
      return {
        async *[Symbol.asyncIterator]() {
          const structLogs = await requestStructLogs(
            `0x${transactionHash.asUint().toString(16)}`,
            provider
          );

          let previousOp;
          for (const [index, step] of structLogs.entries()) {
            const { state } = toMachineState(
              step,
              { index }
            );

            yield state;

            previousOp = step.op;
          }
        }
      };
    }
  };
}

async function requestStructLogs(
  transactionHash: string,
  provider: EthereumProvider
) {
  const { structLogs } = await provider.request({
    method: "debug_traceTransaction",
    params: [transactionHash]
  });

  return structLogs;
}

type StructLogs = Depromise<ReturnType<typeof requestStructLogs>>;
type StructLog = Dearray<StructLogs>;

// helpers instead of digging through ganache's types
type Depromise<P> = P extends Promise<infer T> ? T : P;
type Dearray<A> = A extends Array<infer T> ? T : A;

interface ToMachineStateOptions {
  index: number;
}

function toMachineState(
  step: StructLog,
  options: ToMachineStateOptions
): {
  state: Machine.State;
  storage: {
    [slot: string]: Data
  };
} {
  const { index } = options;

  const constantUint = (value: number): Promise<bigint> =>
    Promise.resolve(Data.fromNumber(value).asUint());

  const makeStack = (
    stack: StructLog["stack"]
  ): Machine.State.Stack => {
    const length = stack.length;

    return {
      length: constantUint(length),

      async peek({
        depth,
        slice: {
          offset = 0n,
          length = 32n
        } = {}
      }) {
        const entry = stack.at(-Number(depth));
        const data = Data.fromHex(`0x${entry || ""}`);

        const sliced = new Uint8Array(data).slice(
          Number(offset),
          Number(offset + length)
        );

        return new Data(sliced);
      }
    };
  };

  const makeBytes = (
    words: StructLog["memory" /* | theoretically others */]
  ): Machine.State.Bytes => {
    const data = Data.fromHex(`0x${words.join("")}`);

    return {
      length: constantUint(data.length),

      async read({ slice: { offset, length } }) {
        return new Data(data.slice(
          Number(offset),
          Number(offset + length)
        ));
      }
    }
  };

  const makeWords = (
    slots: StructLog["storage" /* | theoretically others */]
  ): Machine.State.Words => {
    return {
      async read({
        slot,
        slice: {
          offset = 0n,
          length = 32n
        } = {}
      }) {
        const rawHex = slots[
          slot.resizeTo(32).toHex().slice(2) as keyof typeof slots
        ];

        const data = Data.fromHex(`0x${rawHex}`);

        return new Data(data.slice(
          Number(offset),
          Number(offset + length)
        ));
      }
    };
  };

  return {
    state: {
      traceIndex: constantUint(index),
      programCounter: constantUint(step.pc),
      opcode: Promise.resolve(step.op),

      stack: makeStack(step.stack),

      memory: makeBytes(step.memory),

      storage: makeWords(step.storage),

      calldata: undefined as unknown as Machine.State.Bytes,
      returndata: undefined as unknown as Machine.State.Bytes,
      code: undefined as unknown as Machine.State.Bytes,

      transient: undefined as unknown as Machine.State.Words,
    },

    storage: {}
  };
}
