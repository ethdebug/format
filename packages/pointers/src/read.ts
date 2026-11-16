import { Pointer } from "@ethdebug/format";
import { type Machine, Raw } from "@ethdebug/common";
import type { Cursor } from "#cursor";

export interface ReadOptions {
  state: Machine.State;
}

export async function read(
  region: Cursor.Region,
  options: ReadOptions,
): Promise<Raw> {
  const { location } = region;
  const { state } = options;

  switch (location) {
    case "stack": {
      const { slot, offset, length } = withPropertiesAsUints(
        ["slot", "offset", "length"],
        region,
      );

      return await readSegment({ offset, length }, (carry, slice) =>
        state.stack.peek({ depth: slot + carry, slice }),
      );
    }
    case "memory": {
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await state.memory.read({
        slice: {
          offset: offset,
          length: length,
        },
      });
    }
    case "storage": {
      const { slot } = region;
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await readSegment({ offset, length }, (carry, slice) =>
        state.storage.read({ slot: slotAfter(slot, carry), slice }),
      );
    }
    case "calldata": {
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await state.calldata.read({ slice: { offset, length } });
    }
    case "returndata": {
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await state.returndata.read({ slice: { offset, length } });
    }
    case "transient": {
      const { slot } = region;
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await readSegment({ offset, length }, (carry, slice) =>
        state.transient.read({ slot: slotAfter(slot, carry), slice }),
      );
    }
    case "code": {
      const { offset, length } = withPropertiesAsUints(
        ["offset", "length"],
        region,
      );

      return await state.code.read({ slice: { offset, length } });
    }
  }
}

const wordsize = 32n;

/**
 * Read a segment of bytes from a word-addressed data location, where
 * `offset` may meet or exceed the word size (carrying into subsequent
 * words) and `length` may run across word boundaries (concatenating
 * sequentially-addressed words).
 *
 * Given offset `n`, the segment begins at byte `n mod ~wordsize` of the
 * word `floor(n / ~wordsize)` words after the one specified. When `length`
 * is omitted, the segment ends at the end of the word in which it begins.
 *
 * `readWord(carry, slice)` reads bytes from the word `carry` words after
 * the one specified.
 */
async function readSegment(
  { offset = 0n, length }: { offset?: bigint; length?: bigint },
  readWord: (carry: bigint, slice: Machine.State.Slice) => Promise<Raw>,
): Promise<Raw> {
  const startCarry = offset / wordsize;
  const startByte = offset % wordsize;
  const totalLength = length ?? wordsize - startByte;

  if (totalLength === 0n) {
    return Raw.zero();
  }

  const endByte = startByte + totalLength;
  const wordCount = (endByte + wordsize - 1n) / wordsize;

  const words: Raw[] = [];
  for (let index = 0n; index < wordCount; index++) {
    const from = index === 0n ? startByte : 0n;
    const to = index === wordCount - 1n ? endByte - index * wordsize : wordsize;

    words.push(
      await readWord(startCarry + index, {
        offset: from,
        length: to - from,
      }),
    );
  }

  return Raw.concat(...words);
}

/**
 * Compute the slot `carry` slots after `slot`, keeping at least the width
 * of the given slot data.
 */
function slotAfter(slot: Raw, carry: bigint): Raw {
  if (carry === 0n) {
    return slot;
  }

  return Raw.padUntilAtLeast(
    Raw.fromUint(Raw.asUint(slot) + carry),
    slot.length,
  );
}

type DataProperties<R extends Pointer.Region> = {
  [K in keyof Cursor.Region<R> &
    ("slot" | "offset" | "length")]: Cursor.Region<R>[K];
};

type PickDataPropertiesAsUints<
  R extends Pointer.Region,
  U extends keyof DataProperties<R>,
> = {
  [K in U]: undefined extends Cursor.Region<R>[K] ? bigint | undefined : bigint;
};

function withPropertiesAsUints<
  R extends Pointer.Region,
  U extends keyof DataProperties<R>,
>(uintKeys: U[], region: Cursor.Region<R>): PickDataPropertiesAsUints<R, U> {
  const result: Partial<PickDataPropertiesAsUints<R, U>> = {};
  for (const key of uintKeys) {
    const data: Raw | undefined = region[key] as Raw | undefined;
    if (typeof data !== "undefined") {
      result[key] = Raw.asUint(data);
    }
  }

  return result as PickDataPropertiesAsUints<R, U>;
}
