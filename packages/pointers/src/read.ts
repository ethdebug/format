import { Pointer } from "./pointer.js";
import { Machine } from "./machine.js";
import { Data } from "./data.js";
import type { Cursor } from "./cursor.js";
import { evaluate, type EvaluateOptions } from "./evaluate.js";

export interface ReadOptions {
  state: Machine.State;
}

export async function read(
  region: Cursor.Region,
  options: ReadOptions
): Promise<Data> {
  const { location } = region;
  const { state } = options;

  switch (location) {
    case "stack": {
      const {
        slot,
        offset = 0n,
        length = 32n
      } = withPropertiesAsUints(["slot", "offset", "length"], region);

      return await state.stack.peek({
        depth: slot,
        slice: {
          offset,
          length
        }
      });
    }
    case "memory": {
      const {
        offset,
        length
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.memory.read({
        slice: {
          offset: offset,
          length: length
        }
      });
    }
    case "storage": {
      const { slot } = region;
      const {
        offset = 0n,
        length = 32n
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.storage.read({
        slot,
        slice: {
          offset,
          length
        }
      });
    }
    case "calldata": {
      const {
        offset,
        length
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.calldata.read({ slice: { offset, length } });
    }
    case "returndata": {
      const {
        offset,
        length
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.returndata.read({ slice: { offset, length } });
    }
    case "transient": {
      const { slot } = region;
      const {
        offset = 0n,
        length = 32n
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.transient.read({
        slot,
        slice: {
          offset,
          length
        }
      });
    }
    case "code": {
      const {
        offset,
        length
      } = withPropertiesAsUints(["offset", "length"], region);

      return await state.code.read({ slice: { offset, length } });
    }
  }
}

type DataProperties<R extends Pointer.Region> = {
  [K in (
    & keyof Cursor.Region<R>
    & ("slot" | "offset" | "length")
  )]: Cursor.Region<R>[K];
}

type PickDataPropertiesAsUints<
  R extends Pointer.Region,
  U extends keyof DataProperties<R>
> = {
  [K in U]:
    undefined extends Cursor.Region<R>[K]
      ? bigint | undefined
      : bigint
};

function withPropertiesAsUints<
  R extends Pointer.Region,
  U extends keyof DataProperties<R>
>(
  uintKeys: U[],
  region: Cursor.Region<R>
): PickDataPropertiesAsUints<R, U> {
  const result: Partial<PickDataPropertiesAsUints<R, U>> = {};
  for (const key of uintKeys) {
    const data: Data | undefined = region[key] as Data | undefined;
    if (typeof data !== "undefined") {
      result[key] = data.asUint();
    }
  }

  return result as PickDataPropertiesAsUints<R, U>;
}

