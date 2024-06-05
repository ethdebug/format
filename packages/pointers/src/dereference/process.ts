import type { Machine } from "../machine.js";
import type { Cursor } from "../cursor.js";
import { Data } from "../data.js";
import { Pointer } from "../pointer.js";
import { evaluate } from "../evaluate.js";

import { Memo } from "./memo.js";
import { adjustStackLength, evaluateRegion } from "./region.js";

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

  const stack: Memo[] = [Memo.evaluatePointer(pointer)];
  while (stack.length > 0) {
    const memo: Memo = stack.pop() as Memo;

    let memos: Memo[] = [];
    switch (memo.kind) {
      case "evaluate-pointer": {
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

interface ProcessOptions {
  state: Machine.State;
  stackLengthChange: bigint;
  regions: Record<string, Cursor.Region>;
  variables: Record<string, Data>;
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

/**
 * an generator that yields Cursor regions and returns a list of new memos
 * to add to the stack
 */
type Process = AsyncGenerator<Cursor.Region, Memo[]>;


export async function* processPointer(
  pointer: Pointer,
  options: ProcessOptions
): Process {
  const {
    regions: oldRegions,
    variables: oldVariables,
  } = options;

  if (Pointer.isRegion(pointer)) {
    const region = pointer;

    return yield* processRegion(region, options);
  }

  const collection = pointer;

  if (Pointer.Collection.isGroup(collection)) {
    return yield* processGroup(collection, options);
  }

  if (Pointer.Collection.isList(collection)) {
    return yield* processList(collection, options);
  }

  if (Pointer.Collection.isConditional(collection)) {
    return yield* processConditional(collection, options);
  }

  if (Pointer.Collection.isScope(collection)) {
    return yield* processScope(collection, options);
  }

  console.error("%s", JSON.stringify(pointer, undefined, 2));
  throw new Error("Unexpected unknown kind of pointer");
}

async function* processRegion(
  region: Pointer.Region,
  { stackLengthChange, ...options}: ProcessOptions
): Process {
  const evaluatedRegion = await evaluateRegion(
    adjustStackLength(region, stackLengthChange),
    options
  );

  yield evaluatedRegion;

  if (typeof region.name !== "undefined") {
    return [Memo.saveRegions({ [region.name]: evaluatedRegion })];
  }

  return [];
}

async function* processGroup(
  collection: Pointer.Collection.Group,
  options: ProcessOptions
): Process {
  const { group } = collection;
  return group.map(Memo.evaluatePointer);
}

async function* processList(
  collection: Pointer.Collection.List,
  options: ProcessOptions
): Process {
  const { list } = collection;
  const { count: countExpression, each, is } = list;

  const count = (await evaluate(countExpression, options)).asUint();

  const memos: Memo[] = [];
  for (let index = 0n; index < count; index++) {
    memos.push(Memo.saveVariables({
      [each]: Data.fromUint(index)
    }));

    memos.push(Memo.evaluatePointer(is));
  }

  return memos;
}

async function* processConditional(
  collection: Pointer.Collection.Conditional,
  options: ProcessOptions
): Process {
  const { if: ifExpression, then: then_, else: else_ } = collection;

  const if_ = (await evaluate(ifExpression, options)).asUint();

  if (if_) {
    return [Memo.evaluatePointer(then_)];
  }

  // otherwise, return the else clause if it exists (it is optional)
  return else_
    ? [Memo.evaluatePointer(else_)]
    : [];
}

async function* processScope(
  collection: Pointer.Collection.Scope,
  options: ProcessOptions
): Process {
  const { define: variableExpressions, in: in_ } = collection;

  const allVariables = {
    ...options.variables
  };
  const newVariables: { [identifier: string]: Data } = {};
  for (const [identifier, expression] of Object.entries(variableExpressions)) {
    const data = await evaluate(expression, {
      ...options,
      variables: allVariables
    });

    allVariables[identifier] = data;
    newVariables[identifier] = data;
  }

  return [
    Memo.saveVariables(newVariables),
    Memo.evaluatePointer(in_)
  ];
}
