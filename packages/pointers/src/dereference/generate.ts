import type { Machine } from "../machine.js";
import type { Cursor } from "../cursor.js";
import type { Data } from "../data.js";
import type { Pointer } from "../pointer.js";

import { Memo } from "./memo.js";
import { processPointer, type ProcessOptions } from "./process.js";

/**
 * Upfront information needed for generating the concrete Cursor.Regions
 * for a particular pointer at runtime.
 */
export interface GenerateRegionsOptions {
  state: Machine.State;
  initialStackLength: bigint;
}

/**
 * Generator function that yields Cursor.Regions for a given Pointer.
 *
 * This function maintains an internal stack of memos to evaluate,
 * initially populating this stack with a single entry for evaluating the
 * given pointer.
 */
export async function* generateRegions(
  pointer: Pointer,
  generateRegionsOptions: GenerateRegionsOptions
): AsyncIterable<Cursor.Region> {
  const options = await initializeProcessOptions(generateRegionsOptions);

  // extract records for mutation
  const {
    regions,
    variables
  } = options;

  const stack: Memo[] = [Memo.dereferencePointer(pointer)];
  while (stack.length > 0) {
    const memo: Memo = stack.pop() as Memo;

    let memos: Memo[] = [];
    switch (memo.kind) {
      case "dereference-pointer": {
        memos = yield* processPointer(memo.pointer, options);
        break;
      }
      case "save-regions": {
        Object.assign(regions, memo.regions);
        break;
      }
      case "save-variables": {
        Object.assign(variables, memo.variables);
        break;
      }
    }

    // add new memos to the stack in reverse order
    for (let index = memos.length - 1; index >= 0; index--) {
      stack.push(memos[index]);
    }
  }
}

async function initializeProcessOptions({
  state,
  initialStackLength
}: GenerateRegionsOptions): Promise<ProcessOptions> {
  const currentStackLength = await state.stack.length;
  const stackLengthChange = currentStackLength - initialStackLength;

  const regions: Record<string, Cursor.Region> = {};
  const variables: Record<string, Data> = {};

  return {
    state,
    stackLengthChange,
    regions,
    variables
  };
}
