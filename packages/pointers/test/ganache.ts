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

export function machineForProvider(
  provider: EthereumProvider,
  transactionHash: Data
): Machine {
  return {
    trace(): AsyncIterable<Machine.State> {
      return {
        async *[Symbol.asyncIterator]() {
          const structLogs = await requestStructLogs(
            `0x${transactionHash.asUint().toString(16)}`,
            provider
          );

          for (const [index, structLog] of structLogs.entries()) {
            yield toMachineState(structLog, index);
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
type Depromise<P> = P extends Promise<infer T> ? T : P;
type Dearray<A> = A extends Array<infer T> ? T : A;

function toMachineState(step: StructLog, index: number): Machine.State {
  return {
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
  };
}

function constantUint(value: number): Promise<bigint> {
  return Promise.resolve(Data.fromNumber(value).asUint());
}

function makeStack(stack: StructLog["stack"]): Machine.State.Stack {
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
}

function makeBytes(words: StructLog["memory"]): Machine.State.Bytes {
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
}

function makeWords(slots: StructLog["storage"]): Machine.State.Words {
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
}
