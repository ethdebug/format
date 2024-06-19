import type { Machine } from "../machine.js";
import type { Cursor } from "../cursor.js";
import { read } from "../read.js";

export function createCursor(
  simpleCursor: (state: Machine.State) => AsyncIterable<Cursor.Region>
): Cursor {
  return {
    async view(state: Machine.State) {
      const list = [];
      for await (const region of simpleCursor(state)) {
        list.push(region);
      }

      const named: { [name: string]: Cursor.Region[] } = {};
      const current: { [name: string]: Cursor.Region } = {};

      const propertyFlags = {
        writable: false,
        enumerable: false,
        configurable: false
      } as const;

      const regions: Cursor.Regions = Object.create(Array.prototype, {
        length: {
          value: list.length,
          ...propertyFlags
        }
      });

      for (const [index, region] of list.entries()) {
        Object.defineProperty(regions, index, {
          value: region,
          ...propertyFlags,
          enumerable: true,
        });

        if (typeof region.name === "string") {
          if (!(region.name in named)) {
            named[region.name] = [];
          }
          named[region.name].push(region);
          current[region.name] = region;
        }
      }

      for (const [name, region] of Object.entries(current)) {
        Object.defineProperty(regions, name, {
          value: region,
          ...propertyFlags
        });
      }

      Object.defineProperties(regions, {
        named: {
          value: (name: string) => named[name] || [],
          ...propertyFlags
        },
        lookup: {
          value: {
            ...current
          },
          ...propertyFlags
        }
      });

      return {
        regions,
        async read(region: Cursor.Region) {
          return await read(region, { state });
        }
      };
    }
  };
}
