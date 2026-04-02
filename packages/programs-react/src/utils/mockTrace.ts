/**
 * Utilities for creating mock execution traces.
 */

import type { Program } from "@ethdebug/format";

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
 * Extract variables that are in scope at a given instruction.
 *
 * This walks the context and extracts variables from Variables contexts.
 */
export function extractVariablesFromInstruction(
  instruction: Program.Instruction,
): Array<{ identifier?: string; type?: unknown; pointer?: unknown }> {
  if (!instruction.context) {
    return [];
  }

  return extractVariablesFromContext(instruction.context);
}

function extractVariablesFromContext(
  context: Program.Context,
): Array<{ identifier?: string; type?: unknown; pointer?: unknown }> {
  // Variables context
  if ("variables" in context && Array.isArray(context.variables)) {
    return context.variables;
  }

  // Gather context (combines multiple contexts)
  if ("gather" in context && Array.isArray(context.gather)) {
    return context.gather.flatMap(extractVariablesFromContext);
  }

  // Pick context (picks from multiple contexts - take first with variables)
  if ("pick" in context && Array.isArray(context.pick)) {
    for (const subContext of context.pick) {
      const vars = extractVariablesFromContext(subContext);
      if (vars.length > 0) {
        return vars;
      }
    }
  }

  return [];
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
}

/**
 * Extract call info (invoke/return/revert) from an
 * instruction's context tree.
 */
export function extractCallInfoFromInstruction(
  instruction: Program.Instruction,
): CallInfo | undefined {
  if (!instruction.context) {
    return undefined;
  }
  return extractCallInfoFromContext(instruction.context);
}

function extractCallInfoFromContext(
  context: Program.Context,
): CallInfo | undefined {
  // Use unknown intermediate to avoid strict type checks
  // on the context union — we discriminate by key presence
  const ctx = context as unknown as Record<string, unknown>;

  if ("invoke" in ctx) {
    const inv = ctx.invoke as Record<string, unknown>;
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

    // Extract argument names from group entries
    const argNames = extractArgNamesFromInvoke(inv);

    return {
      kind: "invoke",
      identifier: inv.identifier as string | undefined,
      callType,
      argumentNames: argNames,
      pointerRefs,
    };
  }

  if ("return" in ctx) {
    const ret = ctx.return as Record<string, unknown>;
    const pointerRefs: CallInfo["pointerRefs"] = [];
    collectPointerRef(pointerRefs, "data", ret.data);
    collectPointerRef(pointerRefs, "success", ret.success);

    return {
      kind: "return",
      identifier: ret.identifier as string | undefined,
      pointerRefs,
    };
  }

  if ("revert" in ctx) {
    const rev = ctx.revert as Record<string, unknown>;
    const pointerRefs: CallInfo["pointerRefs"] = [];
    collectPointerRef(pointerRefs, "reason", rev.reason);

    return {
      kind: "revert",
      identifier: rev.identifier as string | undefined,
      panic: rev.panic as number | undefined,
      pointerRefs,
    };
  }

  // Walk gather/pick to find call info
  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    for (const sub of ctx.gather as Program.Context[]) {
      const info = extractCallInfoFromContext(sub);
      if (info) {
        return info;
      }
    }
  }

  if ("pick" in ctx && Array.isArray(ctx.pick)) {
    for (const sub of ctx.pick as Program.Context[]) {
      const info = extractCallInfoFromContext(sub);
      if (info) {
        return info;
      }
    }
  }

  return undefined;
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
}

/**
 * Build a call stack by scanning instructions from
 * step 0 to the given step index.
 */
export function buildCallStack(
  trace: TraceStep[],
  pcToInstruction: Map<number, Program.Instruction>,
  upToStep: number,
): CallFrame[] {
  const stack: CallFrame[] = [];

  for (let i = 0; i <= upToStep && i < trace.length; i++) {
    const step = trace[i];
    const instruction = pcToInstruction.get(step.pc);
    if (!instruction) {
      continue;
    }

    const callInfo = extractCallInfoFromInstruction(instruction);
    if (!callInfo) {
      continue;
    }

    if (callInfo.kind === "invoke") {
      // The compiler emits invoke on both the caller JUMP
      // and callee entry JUMPDEST for the same call. These
      // occur on consecutive trace steps. Only skip if the
      // top frame matches AND was pushed on the immediately
      // preceding step — otherwise this is a new call (e.g.
      // recursion with the same function name).
      const top = stack[stack.length - 1];
      const isDuplicate =
        top &&
        top.identifier === callInfo.identifier &&
        top.callType === callInfo.callType &&
        top.stepIndex === i - 1;
      if (!isDuplicate) {
        stack.push({
          identifier: callInfo.identifier,
          stepIndex: i,
          callType: callInfo.callType,
          argumentNames: extractArgNames(instruction),
        });
      }
    } else if (callInfo.kind === "return" || callInfo.kind === "revert") {
      // Pop the matching frame
      if (stack.length > 0) {
        stack.pop();
      }
    }
  }

  return stack;
}

/**
 * Extract argument names from an instruction's invoke
 * context, if present.
 */
function extractArgNames(
  instruction: Program.Instruction,
): string[] | undefined {
  const ctx = instruction.context as Record<string, unknown> | undefined;
  if (!ctx) return undefined;

  // Find the invoke field (may be nested in gather)
  const invoke = findInvokeField(ctx);
  if (!invoke) return undefined;

  const args = invoke.arguments as Record<string, unknown> | undefined;
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
