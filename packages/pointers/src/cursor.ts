import type { Machine } from "./machine.js";
import type { Pointer } from "./pointer.js";
import type { Data } from "./data.js";

export interface Cursor {
  view(state: Machine.State): Promise<Cursor.View>;
}

export namespace Cursor {
  export interface View {
    read(region: Cursor.Region): Promise<Data>;
    regions: Regions
  }

  export type Regions =
    & Cursor.Region[]
    & { [name: string]: Cursor.Region; }
    & {
        named(name: string): Cursor.Region[];
        lookup: { [name: string]: Cursor.Region };
      };

  export type Region<R extends Pointer.Region = Pointer.Region> = {
    [K in keyof R]: K extends "slot" | "offset" | "length"
      ? R[K] extends Pointer.Expression
        ? Data
        : R[K] extends Pointer.Expression | undefined
          ? Data | undefined
          : R[K]
      : R[K];
  }
}
