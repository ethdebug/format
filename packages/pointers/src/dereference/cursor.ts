import type { Machine } from "#machine";
import type { Cursor } from "#cursor";
import { read } from "#read";

export function createCursor(
  simpleCursor: (state: Machine.State) => AsyncIterable<Cursor.Region>,
): Cursor {
  return {
    async view(state: Machine.State) {
      const list = [];
      for await (const region of simpleCursor(state)) {
        list.push(region);
      }

      // no prototype, so that names like `constructor` or `__proto__` are
      // ordinary keys
      const named: { [name: string]: Cursor.Region[] } = Object.create(null);
      const current: { [name: string]: Cursor.Region } = Object.create(null);

      const propertyFlags = {
        writable: false,
        enumerable: false,
        configurable: false,
      } as const;

      const regions: Cursor.Regions = Object.create(Array.prototype, {
        length: {
          value: list.length,
          ...propertyFlags,
        },
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

      Object.defineProperties(regions, {
        named: {
          value: (name: string) => (name in named ? named[name] : []),
          ...propertyFlags,
        },
        lookup: {
          value: current,
          ...propertyFlags,
        },
      });

      // Also expose each name as a property of the array, unless it would
      // shadow a property the array already has (e.g. `length`); those
      // regions remain reachable by `named` and `lookup`.
      for (const [name, region] of Object.entries(current)) {
        if (name in regions) {
          continue;
        }
        Object.defineProperty(regions, name, {
          value: region,
          ...propertyFlags,
        });
      }

      return {
        regions,
        async read(region: Cursor.Region) {
          return await read(region, { state });
        },
      };
    },
  };
}
