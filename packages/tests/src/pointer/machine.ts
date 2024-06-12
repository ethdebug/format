import { Data } from "./data.js";

export interface Machine {
  get stack(): Machine.Stack;
  get memory(): Machine.Bytes;
  get storage(): Machine.Words;
  get calldata(): Machine.Bytes;
  get returndata(): Machine.Bytes;
  get transient(): Machine.Words;
  get code(): Machine.Bytes;
}

export namespace Machine {
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
    }): Promise<Data.Word>;

    /** read element at absolute position */
    read(options: {
      index: bigint;
      slice?: Slice;
    }): Promise<Data.Word>;
  }

  export interface Bytes {
    get length(): Promise<bigint>;

    read(options: { slice: Slice }): Promise<Data>;
  }

  export interface Words {
    read(options: { slot: Data.Word; slice?: Slice }): Promise<Data.Word>;
  }
}

