/**
 * Utilities for extracting debug information from ethdebug format contexts.
 */

import type { SourceRange } from "#types";

/**
 * Extract source ranges from an ethdebug format context object.
 *
 * Handles various context types including:
 * - code: Direct source range
 * - gather: Multiple code regions
 * - pick: Conditional selection
 * - frame: Nested context
 *
 * @param context - The ethdebug context object
 * @returns Array of source ranges
 */
export function extractSourceRange(
  context: unknown | undefined,
): SourceRange[] {
  if (!context || typeof context !== "object") {
    return [];
  }

  const ctx = context as Record<string, unknown>;

  // Handle "code" context - direct source mapping
  if (ctx.code && typeof ctx.code === "object") {
    const code = ctx.code as Record<string, unknown>;
    if (code.range && typeof code.range === "object") {
      const range = code.range as Record<string, number>;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        return [{ offset: range.offset, length: range.length }];
      }
    }
  }

  // Handle "gather" context - multiple code regions
  if (ctx.gather && Array.isArray(ctx.gather)) {
    const ranges: SourceRange[] = [];
    for (const item of ctx.gather) {
      ranges.push(...extractSourceRange(item));
    }
    return ranges;
  }

  // Handle "pick" context - select one from options
  if (ctx.pick && Array.isArray(ctx.pick)) {
    // For now, just return all possible ranges
    const ranges: SourceRange[] = [];
    for (const item of ctx.pick) {
      ranges.push(...extractSourceRange(item));
    }
    return ranges;
  }

  // Handle "frame" context - nested context
  if (ctx.frame && typeof ctx.frame === "object") {
    return extractSourceRange(ctx.frame);
  }

  // Try to extract from nested context property
  if (ctx.context) {
    return extractSourceRange(ctx.context);
  }

  return [];
}

/**
 * Format an ethdebug context object as a readable JSON string.
 *
 * @param context - The context object to format
 * @returns Formatted JSON string
 */
export function formatDebugContext(context: unknown): string {
  if (!context) {
    return "";
  }
  return JSON.stringify(context, null, 2);
}

/**
 * Check if a context contains source range information.
 *
 * @param context - The context to check
 * @returns True if the context contains source ranges
 */
export function hasSourceRange(context: unknown): boolean {
  return extractSourceRange(context).length > 0;
}

/**
 * Kinds of function call contexts.
 */
export type ContextKind =
  | "invoke"
  | "return"
  | "revert"
  | "remark"
  | "code"
  | "other";

/**
 * Classify a debug context by its top-level discriminant.
 */
export function classifyContext(context: unknown): ContextKind {
  if (!context || typeof context !== "object") {
    return "other";
  }

  const ctx = context as Record<string, unknown>;

  if ("invoke" in ctx) return "invoke";
  if ("return" in ctx) return "return";
  if ("revert" in ctx) return "revert";
  if ("remark" in ctx) return "remark";
  if ("code" in ctx) return "code";

  // Check inside gather — a gather of contexts inherits
  // the kind of its function-call child if present
  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    for (const item of ctx.gather) {
      const kind = classifyContext(item);
      if (kind === "invoke" || kind === "return" || kind === "revert") {
        return kind;
      }
    }
  }

  return "other";
}

/**
 * A declaration source range for click-to-source.
 */
export interface DeclarationRange {
  sourceId: string;
  offset: number;
  length: number;
}

/**
 * Summary of a function call context for display.
 */
export interface ContextSummary {
  kind: ContextKind;
  label: string;
  functionName?: string;
  argumentNames?: string[];
  details?: string;
  declaration?: DeclarationRange;
}

/**
 * Extract a human-readable summary from a debug context.
 */
export function summarizeContext(context: unknown): ContextSummary {
  const kind = classifyContext(context);
  const ctx = context as Record<string, unknown>;

  switch (kind) {
    case "invoke": {
      const invoke = findNestedField(ctx, "invoke") as
        | Record<string, unknown>
        | undefined;
      const name = (invoke?.identifier as string) ?? "unknown";
      const callType = invoke?.jump
        ? "internal"
        : invoke?.message
          ? "external"
          : invoke?.create
            ? "create"
            : "";
      const argNames = extractArgumentNames(invoke);
      const declaration = extractDeclaration(invoke);
      const paramList = argNames.length > 0 ? `(${argNames.join(", ")})` : "()";
      return {
        kind,
        label: `invoke ${name}${paramList}`,
        functionName: name,
        argumentNames: argNames.length > 0 ? argNames : undefined,
        details: callType ? `${callType} call` : undefined,
        declaration,
      };
    }

    case "return": {
      const ret = findNestedField(ctx, "return") as
        | Record<string, unknown>
        | undefined;
      const name = (ret?.identifier as string) ?? "unknown";
      const declaration = extractDeclaration(ret);
      return {
        kind,
        label: `return ${name}()`,
        functionName: name,
        declaration,
      };
    }

    case "revert": {
      const rev = findNestedField(ctx, "revert") as
        | Record<string, unknown>
        | undefined;
      const name = (rev?.identifier as string) ?? "unknown";
      const panic = rev?.panic as number | undefined;
      const declaration = extractDeclaration(rev);
      return {
        kind,
        label: `revert ${name}()`,
        functionName: name,
        details: panic !== undefined ? `panic(${panic})` : undefined,
        declaration,
      };
    }

    case "remark":
      return {
        kind,
        label: ctx.remark as string,
      };

    case "code":
      return { kind, label: "source mapping" };

    default:
      return { kind, label: "debug info" };
  }
}

/**
 * Format a function call signature with param names.
 *
 * Returns "name(a, b)" if names are available,
 * "name()" otherwise.
 */
export function formatCallSignature(
  identifier: string | undefined,
  argNames?: string[],
): string {
  const name = identifier || "(anonymous)";
  if (argNames && argNames.length > 0) {
    return `${name}(${argNames.join(", ")})`;
  }
  return `${name}()`;
}

/**
 * Extract argument names from an invoke context's
 * arguments pointer group.
 */
function extractArgumentNames(
  invoke: Record<string, unknown> | undefined,
): string[] {
  if (!invoke) return [];

  const args = invoke.arguments as Record<string, unknown> | undefined;
  if (!args) return [];

  const pointer = args.pointer as Record<string, unknown> | undefined;
  if (!pointer) return [];

  const group = pointer.group as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(group)) return [];

  const names: string[] = [];
  let hasAnyName = false;
  for (const entry of group) {
    const name = entry.name as string | undefined;
    if (name) {
      names.push(name);
      hasAnyName = true;
    } else {
      names.push("_");
    }
  }

  return hasAnyName ? names : [];
}

/**
 * Extract a declaration source range from a function
 * identity object (invoke.invoke, return.return, etc.).
 */
function extractDeclaration(
  identity: Record<string, unknown> | undefined,
): DeclarationRange | undefined {
  if (!identity) return undefined;

  const decl = identity.declaration as Record<string, unknown> | undefined;
  if (!decl) return undefined;

  const source = decl.source as Record<string, unknown> | undefined;
  const range = decl.range as Record<string, number> | undefined;

  if (
    !source ||
    !range ||
    typeof source.id !== "string" ||
    typeof range.offset !== "number" ||
    typeof range.length !== "number"
  ) {
    return undefined;
  }

  return {
    sourceId: source.id,
    offset: range.offset,
    length: range.length,
  };
}

/**
 * Find a field by name, searching inside gather arrays.
 */
function findNestedField(ctx: Record<string, unknown>, field: string): unknown {
  if (field in ctx) return ctx[field];

  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    for (const item of ctx.gather) {
      if (item && typeof item === "object" && field in item) {
        return (item as Record<string, unknown>)[field];
      }
    }
  }

  return undefined;
}
