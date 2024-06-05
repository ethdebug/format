import { Pointer } from "./pointer.js";

import { type Machine } from "./machine.js";

export interface DereferenceOptions {
  pointer: Pointer;
  machine: Machine;
}

export interface Cursor {
  get regions(): Promise<Pointer.Region.Name[]>;

  read(regionName: string): Uint8Array;
  read(regionIndex: number): Uint8Array;
}

export const dereference = ({
  pointer,
  machine
}: DereferenceOptions): Cursor => {
  if (Pointer.isRegion(pointer)) {
    return {
      get regions() {
        return Promise.resolve([pointer.name]);
      },

      read() {
        return Buffer.from([]);
      }
    };
  }

  throw new Error("Not implemented");
};

