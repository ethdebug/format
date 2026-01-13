import { Pointer } from "@ethdebug/format";
import type { Machine } from "../machine.js";
import type { Cursor } from "../cursor.js";
import { Data } from "../data.js";
import { evaluate } from "../evaluate.js";

import { Memo } from "./memo.js";
import { adjustStackLength, evaluateRegion } from "./region.js";

/**
 * Contextual information for use within a pointer dereference process
 */
export interface ProcessOptions {
  templates: Pointer.Templates;
  state: Machine.State;
  stackLengthChange: bigint;
  regions: Record<string, Cursor.Region>;
  variables: Record<string, Data>;
}

/**
 * an generator that yields Cursor regions and returns a list of new memos
 * to add to the stack
 */
export type Process = AsyncGenerator<Cursor.Region, Memo[]>;

/**
 * Process a pointer into a yielded list of concrete, evaluated Cursor.Regions
 * and return a list of new memos to add to the stack for processing next
 */
export async function* processPointer(
  pointer: Pointer,
  options: ProcessOptions,
): Process {
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

  if (Pointer.Collection.isReference(collection)) {
    return yield* processReference(collection, options);
  }

  if (Pointer.Collection.isTemplates(collection)) {
    return yield* processTemplates(collection, options);
  }

  console.error("%s", JSON.stringify(pointer, undefined, 2));
  throw new Error("Unexpected unknown kind of pointer");
}

async function* processRegion(
  region: Pointer.Region,
  { stackLengthChange, ...options }: ProcessOptions,
): Process {
  const evaluatedRegion = await evaluateRegion(
    adjustStackLength(region, stackLengthChange),
    options,
  );

  yield evaluatedRegion;

  if (typeof region.name !== "undefined") {
    return [Memo.saveRegions({ [region.name]: evaluatedRegion })];
  }

  return [];
}

async function* processGroup(
  collection: Pointer.Collection.Group,
  _options: ProcessOptions,
): Process {
  const { group } = collection;
  return group.map(Memo.dereferencePointer);
}

async function* processList(
  collection: Pointer.Collection.List,
  options: ProcessOptions,
): Process {
  const { list } = collection;
  const { count: countExpression, each, is } = list;

  const count = (await evaluate(countExpression, options)).asUint();

  const memos: Memo[] = [];
  for (let index = 0n; index < count; index++) {
    memos.push(
      Memo.saveVariables({
        [each]: Data.fromUint(index),
      }),
    );

    memos.push(Memo.dereferencePointer(is));
  }

  return memos;
}

async function* processConditional(
  collection: Pointer.Collection.Conditional,
  options: ProcessOptions,
): Process {
  const { if: ifExpression, then: then_, else: else_ } = collection;

  const if_ = (await evaluate(ifExpression, options)).asUint();

  if (if_) {
    return [Memo.dereferencePointer(then_)];
  }

  // otherwise, return the else clause if it exists (it is optional)
  return else_ ? [Memo.dereferencePointer(else_)] : [];
}

async function* processScope(
  collection: Pointer.Collection.Scope,
  options: ProcessOptions,
): Process {
  const { define: variableExpressions, in: in_ } = collection;

  const allVariables = {
    ...options.variables,
  };
  const newVariables: { [identifier: string]: Data } = {};
  for (const [identifier, expression] of Object.entries(variableExpressions)) {
    const data = await evaluate(expression, {
      ...options,
      variables: allVariables,
    });

    allVariables[identifier] = data;
    newVariables[identifier] = data;
  }

  return [Memo.saveVariables(newVariables), Memo.dereferencePointer(in_)];
}

async function* processReference(
  collection: Pointer.Collection.Reference,
  options: ProcessOptions,
): Process {
  const { template: templateName, yields } = collection;

  const { templates, variables } = options;

  const template = templates[templateName];

  if (!template) {
    throw new Error(`Unknown pointer template named ${templateName}`);
  }

  const { expect: expectedVariables, for: pointer } = template;

  const definedVariables = new Set(Object.keys(variables));
  const missingVariables = expectedVariables.filter(
    (identifier) => !definedVariables.has(identifier),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      [
        `Invalid reference to template named ${templateName}; missing expected `,
        `variables with identifiers: ${missingVariables.join(", ")}. `,
        `Please ensure these variables are defined prior to this reference.`,
      ].join(""),
    );
  }

  // If yields is specified with mappings, wrap the dereference with
  // push/pop region renames memos
  if (yields && Object.keys(yields).length > 0) {
    return [
      Memo.pushRegionRenames(yields),
      Memo.dereferencePointer(pointer),
      Memo.popRegionRenames(),
    ];
  }

  return [Memo.dereferencePointer(pointer)];
}

async function* processTemplates(
  collection: Pointer.Collection.Templates,
  _options: ProcessOptions,
): Process {
  const { templates, in: in_ } = collection;

  return [
    Memo.pushTemplates(templates),
    Memo.dereferencePointer(in_),
    Memo.popTemplates(),
  ];
}
