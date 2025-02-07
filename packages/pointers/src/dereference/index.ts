import type { Pointer } from "@ethdebug/format";
import type { Machine } from "../machine.js";
import type { Cursor } from "../cursor.js";

import { generateRegions, type GenerateRegionsOptions } from "./generate.js";
import { createCursor } from "./cursor.js";

export interface DereferenceOptions {
  /*
   * Initial machine state
   * Required for any pointers that reference the stack.
   */
  state?: Machine.State;
  templates?: Pointer.Templates
}

/**
 * Dereference an ethdebug/format/pointer document into a Cursor object,
 * which allows inspecting machine state corresponding to the given pointer.
 *
 * Note that `options.state` is required if `pointer` contains any stack
 * regions.
 */
export async function dereference(
  pointer: Pointer,
  dereferenceOptions: DereferenceOptions = {}
): Promise<Cursor> {
  const options = await initializeGenerateRegionsOptions(dereferenceOptions);

  // use a closure to build a simple Cursor-like interface for accepting
  // a machine state and producing a collection of regions.
  const simpleCursor =
    (state: Machine.State): AsyncIterable<Cursor.Region> => ({
      async *[Symbol.asyncIterator]() {
        yield* generateRegions(pointer, { ...options, state });
      }
    });

  return createCursor(simpleCursor);
}

/**
 * Convert DereferenceOptions into the specific pieces of information that
 * `generateRegions()` will potentially need.
 */
async function initializeGenerateRegionsOptions({
  templates = {},
  state: initialState
}: DereferenceOptions): Promise<Omit<GenerateRegionsOptions, "state">> {
  const initialStackLength = initialState
    ? await initialState.stack.length
    : 0n;

  return {
    templates,
    initialStackLength
  };
}
