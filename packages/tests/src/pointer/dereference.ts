import { Pointer } from "./pointer.js";

import { type Machine } from "./machine.js";
import { Data } from "./data.js";

export interface DereferenceOptions {
  pointer: Pointer;
  machine: Machine;
}

export interface Cursor {
  get regions(): Promise<Pointer.Region.Name[]>;

  region(name: string): Cursor.Region;
  region(index: number): Cursor.Region;

}

export namespace Cursor {
  export interface Region {
    inspect(): Promise<Pointer.Region>;
    read(): Promise<Data>;
  }
}

export const dereference = ({
  pointer,
  machine
}: DereferenceOptions): Cursor => {
  if (Pointer.isRegion(pointer)) {
    return new class RegionCursor {
      get regions() {
        return Promise.resolve([pointer.name]);
      }

      region(name: string): Cursor.Region;
      region(index: number): Cursor.Region;
      region(nameOrIndex: string | number): Cursor.Region {
        if (typeof nameOrIndex === "string") {
          const name: string = nameOrIndex;
          if (name !== pointer.name) {
            throw new Error(`Unknown region with name ${name}`);
          }
        } else {
          const index: number = nameOrIndex;
          if (index !== 0) {
            throw new Error(`Unknown region with index ${index}`);
          }
        }

        return new class RegionCursorRegion {
          inspect() {
            return Promise.resolve(pointer);
          }

          read() {
            return Promise.resolve(Data.zero());
          }
        }
      }
    };
  }

  throw new Error("Not implemented");
};

