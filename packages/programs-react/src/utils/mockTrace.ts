/**
 * Utilities for creating mock execution traces.
 */

import { Program } from "@ethdebug/format";
import { effectiveContextForStep } from "./effectiveContext.js";

/**
 * A single step in an execution trace.
 */
export interface TraceStep {
  /** Program counter (byte offset in bytecode) */
  pc: number;
  /** Opcode mnemonic (e.g., "PUSH1", "SLOAD") */
  opcode: string;
  /** Stack entries (from top to bottom) as hex strings or bigints */
  stack?: Array<string | bigint>;
  /** Memory contents as hex string */
  memory?: string;
  /** Storage state: slot (hex) → value (hex) */
  storage?: Record<string, string>;
  /** Gas remaining */
  gas?: bigint;
  /** Return data from last call */
  returndata?: string;
}

/**
 * Specification for creating a mock trace.
 */
export interface MockTraceSpec {
  /** Sequence of execution steps */
  steps: TraceStep[];
  /** Program definition with instructions */
  program: Program;
}

/**
 * Create a mock trace from a specification.
 *
 * This allows creating traces for demonstration without running real EVM.
 */
export function createMockTrace(spec: MockTraceSpec): TraceStep[] {
  return spec.steps.map((step) => ({
    ...step,
    // Ensure stack has default value
    stack: step.stack || [],
    // Ensure storage has default value
    storage: step.storage || {},
  }));
}

/**
 * Find the instruction at a given program counter.
 */
export function findInstructionAtPc(
  program: Program,
  pc: number,
): Program.Instruction | undefined {
  return program.instructions?.find((instr) => instr.offset === pc);
}

/**
 * A variable entry, as a `variables` context lists it.
 */
type VariableEntry = {
  identifier?: string;
  declaration?: unknown;
  type?: unknown;
  pointer?: unknown;
};

/** A variable entry, with the `frame` of the context that lists it */
interface Listed {
  entry: VariableEntry;
  frame?: string;
}

/**
 * Extract variables that are in scope at a given instruction.
 *
 * All of a context's keys apply, and so do all of a `gather`'s
 * contexts, so this reads every `variables` list: the context's own
 * and each gathered context's. Only one of a `pick`'s contexts holds,
 * so of a pick it reads only the variables that every one of its
 * contexts lists alike (the same identifier, declaration and
 * pointer), without a type they differ on. Entries for one variable (the same identifier and
 * declaration, in the same frame) compose into one; an entry without
 * a declaration stays apart, as does an entry from another frame.
 */
export function extractVariablesFromInstruction(
  instruction: Program.Instruction,
): VariableEntry[] {
  if (!instruction.context) {
    return [];
  }

  const joined: Listed[] = [];
  for (const listed of listedIn(instruction.context)) {
    const same = joined.find((other) => sameVariable(other, listed));
    if (same) {
      same.entry = { ...same.entry, ...listed.entry };
    } else {
      joined.push({ ...listed });
    }
  }
  return joined.map(({ entry }) => entry);
}

function listedIn(context: Program.Context, frame?: string): Listed[] {
  const ctx = context as unknown as Record<string, unknown>;
  const here = typeof ctx.frame === "string" ? ctx.frame : frame;

  const own = Array.isArray(ctx.variables)
    ? (ctx.variables as VariableEntry[]).map((entry) => ({
        entry,
        frame: here,
      }))
    : [];

  // Gather context (all of its contexts apply)
  const gathered = Array.isArray(ctx.gather)
    ? (ctx.gather as Program.Context[]).flatMap((c) => listedIn(c, here))
    : [];

  // Pick context (one of its contexts applies): only what all agree on
  const picked: Listed[] = [];
  if (Array.isArray(ctx.pick) && ctx.pick.length > 0) {
    const [first, ...others] = (ctx.pick as Program.Context[]).map((c) =>
      listedIn(c, here),
    );
    for (const listed of first) {
      const matches = others.map((branch) =>
        branch.find(
          (other) =>
            sameVariable(listed, other) &&
            same(listed.entry.pointer, other.entry.pointer),
        ),
      );
      if (matches.some((match) => match === undefined)) continue;
      // A type the contexts differ on holds in only some of them
      const { type, ...rest } = listed.entry;
      const typed = matches.every((match) => same(type, match!.entry.type));
      picked.push({ ...listed, entry: typed ? listed.entry : rest });
    }
  }

  return [...own, ...gathered, ...picked];
}

/** Whether two entries are for one variable: the same identifier and
 * declaration (both given), in the same frame */
function sameVariable(a: Listed, b: Listed): boolean {
  const x = a.entry.declaration as Declaration | undefined;
  const y = b.entry.declaration as Declaration | undefined;
  return (
    a.frame === b.frame &&
    a.entry.identifier === b.entry.identifier &&
    x !== undefined &&
    y !== undefined &&
    x.source?.id === y.source?.id &&
    x.range?.offset === y.range?.offset &&
    x.range?.length === y.range?.length
  );
}

type Declaration = {
  source?: { id?: unknown };
  range?: { offset?: unknown; length?: unknown };
};

/** Structural equality, whatever the order of keys */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) =>
      same(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    )
  );
}

/**
 * Info about a function call context on an instruction.
 */
export interface CallInfo {
  /** The kind of call event */
  kind: "invoke" | "return" | "revert";
  /** Function name (from Function.Identity) */
  identifier?: string;
  /** Call variant for invoke contexts */
  callType?: "internal" | "external" | "create";
  /** Named arguments (from invoke context) */
  argumentNames?: string[];
  /** Panic code for revert contexts */
  panic?: number;
  /** Named pointer refs to resolve */
  pointerRefs: Array<{
    label: string;
    pointer: unknown;
  }>;
  /**
   * True when a `tailcall` transform is present on the same
   * instruction — the call was realized as a tail-call
   * (TCO), reusing the current frame rather than nesting.
   */
  isTailCall?: boolean;
  /**
   * True when an `inline` transform is present on the same
   * instruction — this invoke/return belongs to an inlined
   * (virtual) activation, not a real call.
   */
  isInline?: boolean;
}

/**
 * Extract compiler `transform` annotation identifiers
 * (e.g. "tailcall", "inline") from an instruction's context
 * tree, walking gather/pick composites.
 */
export function extractTransformFromInstruction(
  instruction: Program.Instruction,
): string[] {
  if (!instruction.context) {
    return [];
  }
  return extractTransformFromContext(instruction.context);
}

function extractTransformFromContext(context: Program.Context): string[] {
  if (Program.Context.isTransform(context)) {
    return context.transform;
  }

  // gather/pick are still key-probed here, matching the
  // sibling extractors in this file (a broader guard
  // migration is tracked separately).
  const ctx = context as unknown as Record<string, unknown>;

  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    return (ctx.gather as Program.Context[]).flatMap(
      extractTransformFromContext,
    );
  }

  if ("pick" in ctx && Array.isArray(ctx.pick)) {
    return (ctx.pick as Program.Context[]).flatMap(extractTransformFromContext);
  }

  return [];
}

/**
 * Extract the primary call event (invoke/return/revert) from an
 * instruction's context tree, decorated with transform flags.
 *
 * A context can legitimately carry BOTH an invoke and a return
 * (e.g. a tail-call back-edge, or an inlined body that emits to a
 * single instruction). This accessor returns just the first event
 * for display banners; call-stack reconstruction uses
 * {@link extractCallEvents}, which surfaces every event so a
 * co-located return is never swallowed by the invoke.
 */
export function extractCallInfoFromInstruction(
  instruction: Program.Instruction,
): CallInfo | undefined {
  return extractCallEvents(instruction)[0];
}

/**
 * Extract ALL call events (invoke/return/revert) from an
 * instruction's context tree, in document order (invoke before
 * return within one context), decorated with the instruction's
 * transform flags. Returns [] when there is no call context.
 */
export function extractCallEvents(
  instruction: Program.Instruction,
): CallInfo[] {
  if (!instruction.context) {
    return [];
  }
  return extractCallEventsFromContext(instruction.context);
}

function extractCallEventsFromContext(context: Program.Context): CallInfo[] {
  const events = collectCallInfos(context);
  if (events.length === 0) {
    return [];
  }
  const transforms = extractTransformFromContext(context);
  const isTailCall = transforms.includes("tailcall");
  const isInline = transforms.includes("inline");
  if (!isTailCall && !isInline) {
    return events;
  }
  return events.map((e) => ({
    ...e,
    ...(isTailCall ? { isTailCall: true } : {}),
    ...(isInline ? { isInline: true } : {}),
  }));
}

/**
 * Collect the invoke/return/revert events carried by a context
 * tree, in order. Invoke precedes return within a single context;
 * gather/pick children are visited in sequence.
 */
function collectCallInfos(context: Program.Context): CallInfo[] {
  // Use unknown intermediate to avoid strict type checks
  // on the context union — we discriminate by key presence
  const ctx = context as unknown as Record<string, unknown>;
  const out: CallInfo[] = [];

  if ("invoke" in ctx) {
    out.push(parseInvoke(ctx.invoke as Record<string, unknown>));
  }
  if ("return" in ctx) {
    out.push(parseReturn(ctx.return as Record<string, unknown>));
  }
  if ("revert" in ctx) {
    out.push(parseRevert(ctx.revert as Record<string, unknown>));
  }

  if (Array.isArray(ctx.gather)) {
    for (const sub of ctx.gather as Program.Context[]) {
      out.push(...collectCallInfos(sub));
    }
  }
  if (Array.isArray(ctx.pick)) {
    for (const sub of ctx.pick as Program.Context[]) {
      out.push(...collectCallInfos(sub));
    }
  }

  return out;
}

function parseInvoke(inv: Record<string, unknown>): CallInfo {
  const pointerRefs: CallInfo["pointerRefs"] = [];

  let callType: CallInfo["callType"];
  if ("jump" in inv) {
    callType = "internal";
    collectPointerRef(pointerRefs, "target", inv.target);
    collectPointerRef(pointerRefs, "arguments", inv.arguments);
  } else if ("message" in inv) {
    callType = "external";
    collectPointerRef(pointerRefs, "target", inv.target);
    collectPointerRef(pointerRefs, "gas", inv.gas);
    collectPointerRef(pointerRefs, "value", inv.value);
    collectPointerRef(pointerRefs, "input", inv.input);
  } else if ("create" in inv) {
    callType = "create";
    collectPointerRef(pointerRefs, "value", inv.value);
    collectPointerRef(pointerRefs, "salt", inv.salt);
    collectPointerRef(pointerRefs, "input", inv.input);
  }

  return {
    kind: "invoke",
    identifier: inv.identifier as string | undefined,
    callType,
    argumentNames: extractArgNamesFromInvoke(inv),
    pointerRefs,
  };
}

function parseReturn(ret: Record<string, unknown>): CallInfo {
  const pointerRefs: CallInfo["pointerRefs"] = [];
  collectPointerRef(pointerRefs, "data", ret.data);
  collectPointerRef(pointerRefs, "success", ret.success);
  return {
    kind: "return",
    identifier: ret.identifier as string | undefined,
    pointerRefs,
  };
}

function parseRevert(rev: Record<string, unknown>): CallInfo {
  const pointerRefs: CallInfo["pointerRefs"] = [];
  collectPointerRef(pointerRefs, "reason", rev.reason);
  return {
    kind: "revert",
    identifier: rev.identifier as string | undefined,
    panic: rev.panic as number | undefined,
    pointerRefs,
  };
}

function extractArgNamesFromInvoke(
  inv: Record<string, unknown>,
): string[] | undefined {
  const args = inv.arguments as Record<string, unknown> | undefined;
  if (!args) return undefined;

  const pointer = args.pointer as Record<string, unknown> | undefined;
  if (!pointer) return undefined;

  const group = pointer.group as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(group)) return undefined;

  const names: string[] = [];
  let hasAny = false;
  for (const entry of group) {
    const name = entry.name as string | undefined;
    if (name) {
      names.push(name);
      hasAny = true;
    } else {
      names.push("_");
    }
  }

  return hasAny ? names : undefined;
}

function collectPointerRef(
  refs: CallInfo["pointerRefs"],
  label: string,
  value: unknown,
): void {
  if (value && typeof value === "object" && "pointer" in value) {
    refs.push({ label, pointer: (value as { pointer: unknown }).pointer });
  }
}

/**
 * A frame in the call stack.
 */
export interface CallFrame {
  /** Function name */
  identifier?: string;
  /** The step index where this call was invoked */
  stepIndex: number;
  /** The call type */
  callType?: "internal" | "external" | "create";
  /** Named arguments (from invoke context) */
  argumentNames?: string[];
  /** Individual argument pointers for value resolution */
  argumentPointers?: unknown[];
  /**
   * True when this frame was (re)entered via a tail call
   * (TCO). The frame was reused in place rather than nested.
   */
  isTailCall?: boolean;
  /**
   * True when this frame is a VIRTUAL activation reconstructed
   * from an inlined body (transform:["inline"]) rather than a
   * real call. Its instructions were spliced into the caller;
   * no JUMP occurred.
   */
  isInline?: boolean;
}

/**
 * Build the call stack as observed at a trace step.
 *
 * Instruction contexts are POSTCONDITIONS, so the frame list at
 * step i reflects the contexts of the instructions executed at
 * steps 0..i-1, with the program-level context as the base case
 * (see {@link effectiveContextForStep}). A frame therefore opens
 * on the step AFTER its invoke instruction — the same step on
 * which the call-info banner first names the invoke — and a
 * frame's `stepIndex` is the step whose observed state its
 * argument pointers describe. Likewise a frame closes on the
 * step AFTER its return (or revert) instruction: when a callee's
 * exit JUMP carries the return, the frame is shown through that
 * JUMP and gone at the first step back in the caller.
 */
export function buildCallStack(
  trace: TraceStep[],
  pcToInstruction: Map<number, Program.Instruction>,
  upToStep: number,
  programContext?: Program.Context,
): CallFrame[] {
  const stack: CallFrame[] = [];
  const contextAtPc = (pc: number) => pcToInstruction.get(pc)?.context;

  for (let i = 0; i <= upToStep && i < trace.length; i++) {
    // A step without a context contributes no call events and no
    // inline membership; the membership guard below still applies.
    const context = effectiveContextForStep({
      programContext,
      contextAtPc,
      trace,
      stepIndex: i,
    });
    const ctx = context as unknown as Record<string, unknown> | undefined;

    // Per-instruction inline membership drives the defensive
    // guard below: an inlined body's instructions all carry
    // transform:["inline"] (nested inlining stacks the marker), so
    // the count bounds how many virtual frames may legitimately be
    // open on this instruction.
    const transforms = context ? extractTransformFromContext(context) : [];
    const inlineCount = transforms.filter((t) => t === "inline").length;

    // A tail-call back-edge carries both a `return` (the previous
    // iteration) and an `invoke` (the next iteration) on a single
    // instruction. The activation is reused, not nested or
    // unwound, so depth is unchanged: replace the top frame in
    // place rather than pushing a second frame or popping it away.
    // Identity comes from the invoke leaf. Detection is structural
    // (return + invoke together), so the call stack stays correct
    // even for consumers that ignore transforms — but an inlined
    // single-instruction body ALSO carries both; it is a virtual
    // activation handled by the event loop below, so exclude the
    // inline marker here. The isTailCall *label* (which drives the
    // call-stack chip / info banner) follows the `tailcall` marker.
    const backEdgeInvoke = ctx ? findInvokeField(ctx) : undefined;
    if (
      ctx &&
      backEdgeInvoke &&
      hasReturnContext(ctx) &&
      !transforms.includes("inline")
    ) {
      const argResult = extractArgInfo(ctx);
      const frame: CallFrame = {
        identifier: backEdgeInvoke.identifier as string | undefined,
        stepIndex: i,
        callType: invokeCallType(backEdgeInvoke),
        argumentNames: argResult?.names,
        argumentPointers: argResult?.pointers,
        isTailCall: transforms.includes("tailcall"),
      };
      if (stack.length > 0) {
        stack[stack.length - 1] = frame;
      } else {
        stack.push(frame);
      }
      continue;
    }

    // A context may carry more than one event (invoke + return),
    // e.g. an inlined body that emits to a single instruction.
    // Process them in order: an invoke opens a frame and a return
    // closes it, both as of this step (the step after the
    // instruction that carries them). An instruction that carries
    // both, such as a single-op inlined body, so shows no frame.
    const events = context ? extractCallEventsFromContext(context) : [];
    for (const event of events) {
      if (event.kind === "invoke") {
        // The compiler emits invoke on both the caller JUMP and
        // callee entry JUMPDEST for a REAL call, on consecutive
        // steps — collapse that double. Key the dedup on the
        // inline marker so a virtual invoke never merges with an
        // adjacent real invoke of the same name (and vice versa).
        const top = stack[stack.length - 1];
        const isDuplicate =
          top &&
          top.identifier === event.identifier &&
          top.callType === event.callType &&
          top.stepIndex === i - 1 &&
          !!top.isInline === !!event.isInline;
        if (isDuplicate) {
          // Root the frame at the callee entry's postcondition step:
          // the argument pointers/names live on the JUMPDEST, not
          // the JUMP, and describe the state observed after it.
          const argResult = ctx ? extractArgInfo(ctx) : undefined;
          top.stepIndex = i;
          top.argumentNames = argResult?.names ?? top.argumentNames;
          top.argumentPointers = argResult?.pointers;
        } else {
          const argResult = ctx ? extractArgInfo(ctx) : undefined;
          stack.push({
            identifier: event.identifier,
            stepIndex: i,
            callType: event.callType,
            argumentNames: argResult?.names,
            argumentPointers: argResult?.pointers,
            // Tag virtual activations so the widget can render
            // them distinctly from real calls.
            ...(event.isInline ? { isInline: true } : {}),
          });
        }
      } else if (event.kind === "return" || event.kind === "revert") {
        if (stack.length > 0) {
          stack.pop();
        }
      }
    }

    // Defensive membership guard: virtual frames beyond the
    // instruction's inline-marker count are stale — belt-and-
    // suspenders against a dropped or incomplete virtual return so
    // a phantom activation can never leak into caller code (or
    // linger after an inner inlined body has ended).
    let trailingVirtual = 0;
    for (let k = stack.length - 1; k >= 0 && stack[k].isInline; k--) {
      trailingVirtual++;
    }
    while (
      trailingVirtual > inlineCount &&
      stack.length > 0 &&
      stack[stack.length - 1].isInline
    ) {
      stack.pop();
      trailingVirtual--;
    }
  }

  return stack;
}

/**
 * Extract argument names and pointers from a context's invoke,
 * if present.
 */
function extractArgInfo(
  ctx: Record<string, unknown>,
): { names?: string[]; pointers?: unknown[] } | undefined {
  const invoke = findInvokeField(ctx);
  if (!invoke) return undefined;

  const args = invoke.arguments as Record<string, unknown> | undefined;
  if (!args) return undefined;

  const pointer = args.pointer as Record<string, unknown> | undefined;
  if (!pointer) return undefined;

  const group = pointer.group as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(group)) return undefined;

  const names: string[] = [];
  const pointers: unknown[] = [];
  let hasAnyName = false;
  for (const entry of group) {
    const name = entry.name as string | undefined;
    if (name) {
      names.push(name);
      hasAnyName = true;
    } else {
      names.push("_");
    }
    pointers.push(entry);
  }

  return {
    names: hasAnyName ? names : undefined,
    pointers,
  };
}

/**
 * Determine the call type of a raw invoke record from its
 * discriminant key.
 */
function invokeCallType(inv: Record<string, unknown>): CallFrame["callType"] {
  if ("jump" in inv) return "internal";
  if ("message" in inv) return "external";
  if ("create" in inv) return "create";
  return undefined;
}

/**
 * Whether an instruction's context carries a `return` — either
 * directly or nested one level inside a gather. Mirrors
 * findInvokeField so the flat (multi-discriminator) and gather
 * back-edge shapes are both recognized.
 */
function hasReturnContext(ctx: Record<string, unknown>): boolean {
  if ("return" in ctx) {
    return true;
  }
  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    return ctx.gather.some(
      (item) => item && typeof item === "object" && "return" in item,
    );
  }
  return false;
}

function findInvokeField(
  ctx: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if ("invoke" in ctx) {
    return ctx.invoke as Record<string, unknown>;
  }
  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    for (const item of ctx.gather) {
      if (item && typeof item === "object" && "invoke" in item) {
        return (item as Record<string, unknown>).invoke as Record<
          string,
          unknown
        >;
      }
    }
  }
  return undefined;
}

/**
 * Build a map of PC to instruction for quick lookup.
 */
export function buildPcToInstructionMap(
  program: Program,
): Map<number, Program.Instruction> {
  const map = new Map<number, Program.Instruction>();
  for (const instr of program.instructions || []) {
    // offset can be number or hex string (Data.Value)
    const offset =
      typeof instr.offset === "string"
        ? parseInt(instr.offset, 16)
        : instr.offset;
    map.set(offset, instr);
  }
  return map;
}
