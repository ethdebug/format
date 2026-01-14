import type * as Ir from "#ir";
import type * as Format from "@ethdebug/format";

/**
 * Combine multiple debug contexts into a single context.
 * If multiple contexts have source information, creates a pick context.
 * Filters out empty contexts.
 */
export function combineDebugContexts(
  ...debugs: (Ir.Instruction.Debug | Ir.Block.Debug | undefined)[]
): Ir.Instruction.Debug {
  // Filter out undefined and empty debug objects
  const contexts = debugs
    .filter((d): d is Ir.Instruction.Debug | Ir.Block.Debug => d !== undefined)
    .map((d) => d.context)
    .filter((c): c is Format.Program.Context => c !== undefined);

  if (contexts.length === 0) {
    return {};
  }

  // Flatten pick contexts - if a context has a pick, extract its children
  const flattenedContexts: Format.Program.Context[] = [];
  for (const context of contexts) {
    if ("pick" in context && Array.isArray(context.pick)) {
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

  // Multiple unique contexts - create a pick context
  return {
    context: {
      pick: uniqueContexts,
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
 * Uses pick contexts to preserve all distinct debug information.
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

    case "hash":
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
    case "cast":
      addValueDebug(instruction.value);
      break;
    case "length":
      addValueDebug(instruction.object);
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
