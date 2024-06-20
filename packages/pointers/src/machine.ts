import type { Data } from "./data.js";

export interface Machine {
  trace(): AsyncIterable<Machine.State>;
}

export namespace Machine {

  export interface State {
    get traceIndex(): Promise<bigint>;
    get programCounter(): Promise<bigint>;
    get opcode(): Promise<string>;

    get stack(): State.Stack;
    get memory(): State.Bytes;
    get storage(): State.Words;
    get calldata(): State.Bytes;
    get returndata(): State.Bytes;
    get transient(): State.Words;
    get code(): State.Bytes;
  }

  export namespace State {
    export interface Slice {
      offset: bigint;
      length: bigint;
    }

    export interface Stack {
      get length(): Promise<bigint>;

      /** read element at position from top of stack */
      peek(options: {
        depth: bigint;
        slice?: Slice;
      }): Promise<Data>;
    }

    export interface Bytes {
      get length(): Promise<bigint>;

      read(options: { slice: Slice }): Promise<Data>;
    }

    export interface Words {
      read(options: { slot: Data; slice?: Slice }): Promise<Data>;
    }
  }
}
