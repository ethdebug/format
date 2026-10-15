import type * as Ir from "#ir";
import type * as Format from "@ethdebug/format";

/**
 * Combine multiple debug contexts into a single context that asserts
 * all of them. Contexts with disjoint keys compose flat as siblings;
 * contexts with a colliding key (e.g. two `code` ranges) are gathered.
 * Filters out empty contexts.
 */
export function combineDebugContexts(
  ...debugs: (Ir.Instruction.Debug | Ir.Block.Debug | undefined)[]
): Ir.Instruction.Debug {
  // The first debug is the instruction that stays in place (others
  // are folded into it), so the result keeps its inline sites and
  // origin.
  return withPlacement(combineContexts(debugs), debugs[0]);
}

/** Keep an instruction's inline sites, origin and (if it returns from
 * an inlined function) its debug once returned on a new debug. */
function withPlacement(
  debug: Ir.Instruction.Debug,
  from: Ir.Instruction.Debug | undefined,
): Ir.Instruction.Debug {
  return {
    ...debug,
    ...(from?.inlineSites ? { inlineSites: from.inlineSites } : {}),
    ...(from?.origin ? { origin: from.origin } : {}),
    ...(from?.returned ? { returned: from.returned } : {}),
  };
}

function combineContexts(
  debugs: (Ir.Instruction.Debug | Ir.Block.Debug | undefined)[],
): Ir.Instruction.Debug {
  // Filter out undefined and empty debug objects
  const contexts = debugs
    .filter((d): d is Ir.Instruction.Debug | Ir.Block.Debug => d !== undefined)
    .map((d) => d.context)
    .filter((c): c is Format.Program.Context => c !== undefined);

  if (contexts.length === 0) {
    return {};
  }

  // Flatten enclosing gather (and legacy pick) wrappers so their
  // children re-compose here rather than nesting. `gather` children
  // all apply simultaneously, which is exactly what combining means.
  const flattenedContexts: Format.Program.Context[] = [];
  for (const context of contexts) {
    if ("gather" in context && Array.isArray(context.gather)) {
      flattenedContexts.push(...context.gather);
    } else if ("pick" in context && Array.isArray(context.pick)) {
      flattenedContexts.push(...context.pick);
    } else {
      flattenedContexts.push(context);
    }
  }

  // Deduplicate contexts by checking structural equality
  const uniqueContexts: Format.Program.Context[] = [];
  const contextStrings = new Set<string>();

  for (const context of flattenedContexts) {
    // Create a string representation for comparison
    // We need to handle the structure carefully since it might have nested objects
    const contextStr = JSON.stringify(context, (_key, value) => {
      // Sort object keys to ensure consistent stringification
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value)
          .sort()
          .reduce(
            (sorted, key) => {
              sorted[key] = value[key];
              return sorted;
            },
            {} as Record<string, unknown>,
          );
      }
      return value;
    });

    if (!contextStrings.has(contextStr)) {
      contextStrings.add(contextStr);
      uniqueContexts.push(context);
    }
  }

  if (uniqueContexts.length === 0) {
    return {};
  }

  if (uniqueContexts.length === 1) {
    return { context: uniqueContexts[0] };
  }

  // Multiple distinct contexts that all apply simultaneously. If
  // their discriminator keys are disjoint, compose them flat as
  // sibling keys on one object; if any key collides (e.g. two
  // `code` ranges), they cannot be siblings, so gather them. Both
  // mean "all apply" — pick would wrongly mean "choose one".
  const keys = uniqueContexts.flatMap((context) => Object.keys(context));
  const hasCollision = new Set(keys).size !== keys.length;

  if (!hasCollision) {
    return {
      context: Object.assign({}, ...uniqueContexts) as Format.Program.Context,
    };
  }

  return {
    context: {
      gather: uniqueContexts,
    } as Format.Program.Context,
  };
}

/**
 * Preserve debug context from the original instruction when creating a replacement.
 * Optionally combine with additional debug contexts.
 *
 * Works with both old-style (debug field) and new-style (operationDebug field).
 */
export function preserveDebug(
  original:
    | { debug?: Ir.Instruction.Debug | Ir.Block.Debug }
    | { operationDebug?: Ir.Instruction.Debug | Ir.Block.Debug }
    | Ir.Instruction
    | Ir.Block.Phi
    | Ir.Block.Terminator,
  ...additional: (Ir.Instruction.Debug | Ir.Block.Debug | undefined)[]
): Ir.Instruction.Debug {
  // Extract debug context from various possible locations
  let debugContext: Ir.Instruction.Debug | Ir.Block.Debug | undefined;

  if ("operationDebug" in original) {
    debugContext = original.operationDebug;
  } else if ("debug" in original) {
    debugContext = original.debug;
  }

  return combineDebugContexts(debugContext, ...additional);
}

/**
 * Extract contexts from debug objects for transformation tracking.
 * Works with both old-style (debug) and new-style (operationDebug) fields.
 */
export function extractContexts(
  ...items: (
    | { debug?: Ir.Instruction.Debug | Ir.Block.Debug }
    | { operationDebug?: Ir.Instruction.Debug | Ir.Block.Debug }
    | Ir.Instruction
    | Ir.Block.Phi
    | Ir.Block.Terminator
    | undefined
  )[]
): Format.Program.Context[] {
  const contexts: Format.Program.Context[] = [];

  for (const item of items) {
    if (!item) continue;

    let debugContext: Ir.Instruction.Debug | Ir.Block.Debug | undefined;

    if ("operationDebug" in item) {
      debugContext = item.operationDebug;
    } else if ("debug" in item) {
      debugContext = item.debug;
    }

    if (debugContext?.context) {
      contexts.push(debugContext.context);
    }
  }

  return contexts;
}

/**
 * Combine operation debug with field/operand debug contexts.
 * This is used to create a comprehensive debug context for EVM emission
 * that preserves all information from sub-instruction level tracking.
 *
 * The result combines:
 * - The operation's debug context
 * - Debug contexts from all operands/fields
 *
 * Distinct contexts are gathered (or composed flat when their keys
 * are disjoint) so all applicable debug information is preserved.
 */
export function combineSubInstructionContexts(
  operationDebug: Ir.Instruction.Debug | Ir.Block.Debug | undefined,
  fieldsDebug: Record<
    string,
    Ir.Instruction.Debug | Ir.Block.Debug | Ir.ValueDebug | undefined
  >,
): Ir.Instruction.Debug {
  const allDebugContexts: (
    | Ir.Instruction.Debug
    | Ir.Block.Debug
    | Ir.ValueDebug
    | undefined
  )[] = [operationDebug, ...Object.values(fieldsDebug)];

  return combineDebugContexts(...allDebugContexts);
}

/**
 * Extract all debug contexts from an instruction, including operation
 * and all field/operand contexts.
 *
 * This is useful for transformation tracking in optimizer passes.
 */
export function extractSubInstructionContexts(
  instruction: Ir.Instruction,
): Format.Program.Context[] {
  const contexts: Format.Program.Context[] = [];

  // Add operation debug
  if (instruction.operationDebug?.context) {
    contexts.push(instruction.operationDebug.context);
  }

  // Add field-specific debug contexts based on instruction kind
  switch (instruction.kind) {
    case "binary":
      if (instruction.leftDebug?.context) {
        contexts.push(instruction.leftDebug.context);
      }
      if (instruction.rightDebug?.context) {
        contexts.push(instruction.rightDebug.context);
      }
      break;

    case "unary":
      if (instruction.operandDebug?.context) {
        contexts.push(instruction.operandDebug.context);
      }
      break;

    case "read":
    case "write":
      if (instruction.slotDebug?.context) {
        contexts.push(instruction.slotDebug.context);
      }
      if (instruction.offsetDebug?.context) {
        contexts.push(instruction.offsetDebug.context);
      }
      if (instruction.lengthDebug?.context) {
        contexts.push(instruction.lengthDebug.context);
      }
      if (instruction.kind === "write" && instruction.valueDebug?.context) {
        contexts.push(instruction.valueDebug.context);
      }
      break;

    case "compute_offset":
      if (instruction.baseDebug?.context) {
        contexts.push(instruction.baseDebug.context);
      }
      if (
        instruction.offsetKind === "array" &&
        instruction.indexDebug?.context
      ) {
        contexts.push(instruction.indexDebug.context);
      }
      if (
        instruction.offsetKind === "byte" &&
        instruction.offsetDebug?.context
      ) {
        contexts.push(instruction.offsetDebug.context);
      }
      break;

    case "compute_slot":
      if (instruction.baseDebug?.context) {
        contexts.push(instruction.baseDebug.context);
      }
      if (instruction.slotKind === "mapping" && instruction.keyDebug?.context) {
        contexts.push(instruction.keyDebug.context);
      }
      break;

    case "const":
      if (instruction.valueDebug?.context) {
        contexts.push(instruction.valueDebug.context);
      }
      break;

    case "allocate":
      if (instruction.sizeDebug?.context) {
        contexts.push(instruction.sizeDebug.context);
      }
      break;

    case "cast":
      if (instruction.valueDebug?.context) {
        contexts.push(instruction.valueDebug.context);
      }
      break;

    case "length":
      if (instruction.objectDebug?.context) {
        contexts.push(instruction.objectDebug.context);
      }
      break;

    case "assert":
      if (instruction.conditionDebug?.context) {
        contexts.push(instruction.conditionDebug.context);
      }
      break;

    // env has no operands
    case "env":
      break;
  }

  // Also check if operands have their own debug contexts
  // (from the Value.debug field)
  const addValueDebug = (value?: Ir.Value) => {
    if (value?.debug?.context) {
      contexts.push(value.debug.context);
    }
  };

  switch (instruction.kind) {
    case "binary":
      addValueDebug(instruction.left);
      addValueDebug(instruction.right);
      break;
    case "unary":
      addValueDebug(instruction.operand);
      break;
    case "read":
      addValueDebug(instruction.slot);
      addValueDebug(instruction.offset);
      addValueDebug(instruction.length);
      break;
    case "write":
      addValueDebug(instruction.slot);
      addValueDebug(instruction.offset);
      addValueDebug(instruction.length);
      addValueDebug(instruction.value);
      break;
    case "copy":
      addValueDebug(instruction.source);
      addValueDebug(instruction.offset);
      addValueDebug(instruction.length);
      break;
    case "compute_offset":
      addValueDebug(instruction.base);
      if (instruction.offsetKind === "array") {
        addValueDebug(instruction.index);
      }
      if (instruction.offsetKind === "byte") {
        addValueDebug(instruction.offset);
      }
      break;
    case "compute_slot":
      addValueDebug(instruction.base);
      if (instruction.slotKind === "mapping") {
        addValueDebug(instruction.key);
      }
      break;
    case "allocate":
      addValueDebug(instruction.size);
      break;
    case "hash":
      instruction.values.forEach(addValueDebug);
      break;
    case "cast":
      addValueDebug(instruction.value);
      break;
    case "length":
      addValueDebug(instruction.object);
      break;
    case "assert":
      addValueDebug(instruction.condition);
      break;
  }

  return contexts;
}

/**
 * Preserve debug context from the original instruction when creating a
 * replacement, taking into account sub-instruction level debug.
 *
 * This extracts all debug contexts (operation + fields + value debugs)
 * from the original instruction and combines them with any additional
 * debug contexts provided.
 */
export function preserveSubInstructionDebug(
  original: Ir.Instruction,
  ...additional: (Ir.Instruction.Debug | Ir.Block.Debug | undefined)[]
): Ir.Instruction.Debug {
  const originalContexts = extractSubInstructionContexts(original);
  const additionalContexts = additional
    .filter((d): d is Ir.Instruction.Debug | Ir.Block.Debug => d !== undefined)
    .map((d) => d.context)
    .filter((c): c is Format.Program.Context => c !== undefined);

  return combineDebugContexts(
    ...originalContexts.map((c) => ({ context: c })),
    ...additionalContexts.map((c) => ({ context: c })),
  );
}

/**
 * Add one or more `transform` optimization markers to a debug
 * context, composing them as a flat sibling key alongside any
 * existing context discriminators (per the flat-composition
 * convention: gather is only for same-key collisions).
 *
 * Markers are appended to any existing `transform` array on the
 * context, so an instruction touched by multiple passes
 * accumulates the multiset — e.g. a folded value later merged
 * yields `transform: ["fold", "coalesce"]`.
 */
export function addTransform(
  debug: Ir.Instruction.Debug | undefined,
  ...ids: Format.Program.Context.Transform.Identifier[]
): Ir.Instruction.Debug {
  const existing = debug?.context;

  const prior: Format.Program.Context.Transform.Identifier[] =
    existing &&
    "transform" in existing &&
    Array.isArray((existing as Format.Program.Context.Transform).transform)
      ? (existing as Format.Program.Context.Transform).transform
      : [];

  const transform = [...prior, ...ids];

  return withPlacement(
    { context: { ...(existing ?? {}), transform } as Format.Program.Context },
    debug,
  );
}

/** An activation discriminator: a call's `invoke` or its `return` */
export type Activation = "invoke" | "return";

/**
 * The values of a context's `invoke` (or `return`) discriminators, its
 * own and its `gather`'s, in document order.
 */
export function activationsOf(
  context: Format.Program.Context | undefined,
  key: Activation,
): unknown[] {
  if (!context || typeof context !== "object") return [];
  const { gather } = context as { gather?: unknown };
  const own = (context as Record<string, unknown>)[key];
  return [
    ...(own === undefined ? [] : [own]),
    ...(Array.isArray(gather)
      ? (gather as Format.Program.Context[]).flatMap((c) =>
          activationsOf(c, key),
        )
      : []),
  ];
}

/**
 * A context without its `invoke` and `return` discriminators.
 * Undefined if nothing else remains. A `gather` left with one context
 * composes flat, if its keys do not collide.
 */
export function withoutActivations(
  context: Format.Program.Context | undefined,
): Format.Program.Context | undefined {
  if (!context || typeof context !== "object") return context;
  const {
    invoke: _,
    return: __,
    gather,
    ...rest
  } = context as Record<string, unknown>;
  if (!Array.isArray(gather)) {
    return Object.keys(rest).length > 0
      ? (rest as Format.Program.Context)
      : undefined;
  }
  const kept = (gather as Format.Program.Context[])
    .map(withoutActivations)
    .filter((c): c is Format.Program.Context => c !== undefined);
  if (kept.length === 0) {
    return Object.keys(rest).length > 0
      ? (rest as Format.Program.Context)
      : undefined;
  }
  if (
    kept.length === 1 &&
    Object.keys(kept[0]).every((key) => !(key in rest))
  ) {
    return { ...rest, ...kept[0] } as Format.Program.Context;
  }
  return { ...rest, gather: kept } as Format.Program.Context;
}

/**
 * A context with activation discriminators added: `invokes` before
 * the ones it has, `returns` after them, so that nested activations
 * on one instruction open outermost first and close innermost first.
 */
export function withActivations(
  context: Format.Program.Context | undefined,
  { invokes = [], returns = [] }: { invokes?: unknown[]; returns?: unknown[] },
): Format.Program.Context | undefined {
  if (invokes.length === 0 && returns.length === 0) return context;
  const markers = [
    ...[...invokes, ...activationsOf(context, "invoke")].map((invoke) => ({
      invoke,
    })),
    ...[...activationsOf(context, "return"), ...returns].map((value) => ({
      return: value,
    })),
  ] as Format.Program.Context[];
  const rest = withoutActivations(context) as
    | Record<string, unknown>
    | undefined;
  if (!rest) {
    return (
      markers.length === 1 ? markers[0] : { gather: markers }
    ) as Format.Program.Context;
  }
  if (Array.isArray(rest.gather)) {
    return {
      ...rest,
      gather: [...rest.gather, ...markers],
    } as Format.Program.Context;
  }
  // Without its activations, `rest` has no `invoke` or `return` key
  return (
    markers.length === 1
      ? { ...rest, ...markers[0] }
      : { ...rest, gather: markers }
  ) as Format.Program.Context;
}

/** A debug without its `invoke` and `return` discriminators */
export function withoutActivationsDebug(
  debug: Ir.Instruction.Debug | undefined,
): Ir.Instruction.Debug {
  const { context: _, ...rest } = debug ?? {};
  const context = withoutActivations(debug?.context);
  return { ...rest, ...(context ? { context } : {}) };
}

/**
 * An `invoke` or a `return`, as one of the markers a debug carries
 * (see `withActivations`)
 */
export type ActivationMarker = { invoke: unknown } | { return: unknown };

/** A debug's markers, in the order they happen: invokes, then returns */
export function markersOf(
  debug: Ir.Instruction.Debug | undefined,
): ActivationMarker[] {
  return [
    ...activationsOf(debug?.context, "invoke").map((invoke) => ({ invoke })),
    ...activationsOf(debug?.context, "return").map((value) => ({
      return: value,
    })),
  ];
}

/** Whether markers can ride one op: no invoke after a return */
function inOrder(markers: ActivationMarker[]): boolean {
  const firstReturn = markers.findIndex((marker) => "return" in marker);
  return (
    firstReturn < 0 ||
    markers.slice(firstReturn).every((marker) => "return" in marker)
  );
}

/** A debug whose markers are these (in order: see `inOrder`) */
function withMarkers(
  debug: Ir.Instruction.Debug,
  markers: ActivationMarker[],
  returned: Ir.Instruction.Debug | undefined,
): Ir.Instruction.Debug {
  const context = withActivations(withoutActivations(debug.context), {
    invokes: markers.flatMap((m) => ("invoke" in m ? [m.invoke] : [])),
    returns: markers.flatMap((m) => ("return" in m ? [m.return] : [])),
  });
  const { context: _, returned: __, ...rest } = debug;
  return {
    ...rest,
    ...(context ? { context } : {}),
    ...(returned ? { returned } : {}),
  };
}

/** Where `placeActivations` put the markers */
export interface Placement {
  before?: Ir.Instruction.Debug;
  after?: Ir.Instruction.Debug;
  /** The markers that no neighbour could take */
  dropped: ActivationMarker[];
}

/**
 * Put the `invoke` and `return` markers of something removed (an
 * instruction, a jump, a block's entry) onto a neighbour on its own
 * path: what ran just `before` it, or what runs just `after` it.
 *
 * An invoke or a return marks a point on one path: it must not go
 * with what is removed, or onto an op that runs on other paths. An op
 * lists its invokes, then its returns, so the markers split between
 * the two neighbours where each still reads that way: before's own,
 * then the first part; the rest, then after's own. Of those splits,
 * the one that moves the fewest invokes earlier and returns later:
 * the first op kept in a body starts it, and the last one ends it.
 *
 * If no split fits, the markers are dropped (and listed as such): the
 * code stays as the optimizer makes it. Debug information never
 * changes the code.
 */
export function placeActivations(
  markers: ActivationMarker[],
  returned: Ir.Instruction.Debug | undefined,
  {
    before,
    after,
  }: { before?: Ir.Instruction.Debug; after?: Ir.Instruction.Debug },
): Placement {
  if (markers.length === 0) return { before, after, dropped: [] };
  const own = { before: markersOf(before), after: markersOf(after) };
  let best: { at: number; cost: number } | undefined;
  for (let at = 0; at <= markers.length; at++) {
    const early = markers.slice(0, at);
    const late = markers.slice(at);
    if ((early.length > 0 && !before) || (late.length > 0 && !after)) {
      continue;
    }
    if (
      !inOrder([...own.before, ...early]) ||
      !inOrder([...late, ...own.after])
    ) {
      continue;
    }
    const cost =
      early.filter((m) => "invoke" in m).length +
      late.filter((m) => "return" in m).length;
    if (!best || cost < best.cost) best = { at, cost };
  }
  if (!best) return { before, after, dropped: markers };

  const early = markers.slice(0, best.at);
  const late = markers.slice(best.at);
  const returns = (ms: ActivationMarker[]) => ms.some((m) => "return" in m);
  return {
    before:
      before && early.length > 0
        ? withMarkers(
            before,
            [...own.before, ...early],
            returns(early) ? (returned ?? before.returned) : before.returned,
          )
        : before,
    after:
      after && late.length > 0
        ? withMarkers(
            after,
            [...late, ...own.after],
            returns(own.after)
              ? after.returned
              : returns(late)
                ? returned
                : after.returned,
          )
        : after,
    dropped: [],
  };
}

/** What `dropInstructions` did */
export interface Dropped {
  instructions: Ir.Instruction[];
  /** Each kept instruction given a new debug, by the one it replaces */
  replaced: Map<Ir.Instruction, Ir.Instruction>;
  /** The markers that no neighbour could take */
  dropped: ActivationMarker[];
}

/**
 * A block's instructions but those in `drop`, with their `invoke` and
 * `return` markers put on a neighbour on their path (see
 * `placeActivations`): the instruction kept before them, or the
 * block's entry (its JUMPDEST; not the function's entry block); the
 * instruction kept after them, or the block's jump.
 */
export function dropInstructions(
  block: Ir.Block,
  drop: Set<Ir.Instruction>,
  { isEntry }: { isEntry: boolean },
): Dropped {
  const instructions: Ir.Instruction[] = [];
  const replaced = new Map<Ir.Instruction, Ir.Instruction>();
  const dropped: ActivationMarker[] = [];
  // The markers of the dropped instructions since the last one kept
  let pending: ActivationMarker[] = [];
  let pendingReturned: Ir.Instruction.Debug | undefined;

  const settle = (after: Ir.Instruction.Debug | undefined) => {
    if (pending.length === 0) return after;
    const last = instructions.at(-1);
    const before = last
      ? last.operationDebug
      : isEntry
        ? undefined
        : (block.entryActivations ?? {});
    const placed = placeActivations(pending, pendingReturned, {
      before,
      after,
    });
    dropped.push(...placed.dropped);
    pending = [];
    pendingReturned = undefined;
    if (placed.before !== before) {
      if (last) {
        const next = { ...last, operationDebug: placed.before! };
        replaced.set(replacedFrom(last), next as Ir.Instruction);
        instructions[instructions.length - 1] = next as Ir.Instruction;
      } else {
        block.entryActivations = placed.before;
      }
    }
    return placed.after;
  };
  // The original of an instruction already replaced here
  const replacedFrom = (inst: Ir.Instruction) =>
    [...replaced].find(([, to]) => to === inst)?.[0] ?? inst;

  for (const inst of block.instructions) {
    if (drop.has(inst)) {
      pending.push(...markersOf(inst.operationDebug));
      if (activationsOf(inst.operationDebug.context, "return").length > 0) {
        pendingReturned = inst.operationDebug.returned;
      }
      continue;
    }
    const debug = settle(inst.operationDebug);
    if (debug === inst.operationDebug) {
      instructions.push(inst);
    } else {
      const next = { ...inst, operationDebug: debug! } as Ir.Instruction;
      replaced.set(inst, next);
      instructions.push(next);
    }
  }

  const { terminator } = block;
  const jump =
    terminator.kind === "jump" && !terminator.tailCall ? terminator : undefined;
  const debug = settle(jump?.operationDebug);
  if (jump && debug !== jump.operationDebug) {
    block.terminator = { ...jump, operationDebug: debug! };
  }
  return { instructions, replaced, dropped };
}

/** A context listing markers, as a transformation records them */
export function markersContext(
  markers: ActivationMarker[],
): Format.Program.Context {
  return (
    markers.length === 1 ? markers[0] : { gather: markers }
  ) as Format.Program.Context;
}
