import * as Ir from "#ir";

export function formatJson(
  data: unknown,
  pretty: boolean,
  excludeKeys?: string[],
): string {
  if (excludeKeys && excludeKeys.length > 0) {
    data = removeKeys(data, excludeKeys);
  }

  // Use a custom replacer that properly handles repeated (non-circular) references
  const seen = new WeakMap<object, string>();
  let uniqueId = 0;

  // First pass: identify truly circular references
  const findCircular = (
    obj: unknown,
    ancestors: Set<unknown> = new Set(),
  ): void => {
    if (typeof obj !== "object" || obj === null) return;

    if (ancestors.has(obj)) {
      // This is a true circular reference
      seen.set(obj, `__circular_${uniqueId++}__`);
      return;
    }

    ancestors.add(obj);

    if (Array.isArray(obj)) {
      obj.forEach((item) => findCircular(item, ancestors));
    } else {
      // Skip parent field when traversing to avoid false circular detection
      Object.entries(obj).forEach(([key, value]) => {
        if (key !== "parent") {
          findCircular(value, ancestors);
        }
      });
    }

    ancestors.delete(obj);
  };

  findCircular(data);

  // Second pass: stringify with proper handling
  return JSON.stringify(
    data,
    (key, value) => {
      // Skip parent references to avoid circular references
      if (key === "parent") return undefined;

      if (typeof value === "object" && value !== null && seen.has(value)) {
        return "[Circular Reference]";
      }

      return value;
    },
    pretty ? 2 : 0,
  );
}

function removeKeys(obj: unknown, keysToRemove: string[]): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeKeys(item, keysToRemove));
  } else if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!keysToRemove.includes(key)) {
        result[key] = removeKeys(value, keysToRemove);
      }
    }
    return result;
  }
  return obj;
}

export function formatIrText(ir: Ir.Module, source?: string): string {
  const formatter = new Ir.Analysis.Formatter();
  return formatter.format(ir, source);
}
