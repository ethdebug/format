import { Pointer } from "./pointer.js";
import { Machine } from "./machine.js";
import { Data } from "./data.js";
import type { Cursor } from "./dereference.js";
import { evaluate, type EvaluateOptions } from "./evaluate.js";

export interface ReadOptions {
  machine: Machine;
  variables: {
    [identifier: string]: Data;
  };
  regions: {
    [identifier: string]: Pointer.Region;
  }
}

export async function read(
  region: Pointer.Region,
  options: ReadOptions
): Promise<Data> {
  const { location } = region;
  const { machine, variables, regions } = options;

  const slot = "slot" in region
    ? await evaluate(region.slot, {
        ...options,
        regions: {
          ...regions,
          $this: region
        }
      })
    : undefined;

  const offset = "offset" in region && typeof region.offset !== "undefined"
    ? (await evaluate(region.offset, {
        ...options,
        regions: {
          ...regions,
          $this: region
        }
      })).asUint()
    : undefined;

  const length = "length" in region && typeof region.length !== "undefined"
    ? (await evaluate(region.length, {
        ...options,
        regions: {
          ...regions,
          $this: region
        }
      })).asUint()
    : undefined;

  switch (location) {
    case "stack": {
      if (typeof slot === "undefined") {
        throw new Error("Unexpected missing slot");
      }

      return await machine.stack.peek({
        depth: slot.asUint(),
        slice: {
          offset: typeof offset === "undefined" ? 0n : offset,
          length: typeof length === "undefined" ? 32n : length
        }
      });
    }
    case "memory": {
      if (typeof offset === "undefined" || typeof length === "undefined") {
        throw new Error("Unexpected missing offset and/or length");
      }

      return await machine.memory.read({ slice: { offset, length } });
    }
    case "storage": {
      if (typeof slot === "undefined") {
        throw new Error("Unexpected missing slot");
      }

      return await machine.storage.read({
        slot,
        slice: {
          offset: typeof offset === "undefined" ? 0n : offset,
          length: typeof length === "undefined" ? 32n : length
        }
      });
    }
    case "calldata": {
      if (typeof offset === "undefined" || typeof length === "undefined") {
        throw new Error("Unexpected missing offset and/or length");
      }

      return await machine.calldata.read({ slice: { offset, length } });
    }
    case "returndata": {
      if (typeof offset === "undefined" || typeof length === "undefined") {
        throw new Error("Unexpected missing offset and/or length");
      }

      return await machine.returndata.read({ slice: { offset, length } });
    }
    case "transient": {
      if (typeof slot === "undefined") {
        throw new Error("Unexpected missing slot");
      }

      return await machine.transient.read({
        slot,
        slice: {
          offset: typeof offset === "undefined" ? 0n : offset,
          length: typeof length === "undefined" ? 32n : length
        }
      });
    }
    case "code": {
      if (typeof offset === "undefined" || typeof length === "undefined") {
        throw new Error("Unexpected missing offset and/or length");
      }

      return await machine.code.read({ slice: { offset, length } });
    }
  }
}
