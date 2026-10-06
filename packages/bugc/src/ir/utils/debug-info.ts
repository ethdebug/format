import type * as Ir from "#ir";

/**
 * Set a function's debug info (variable metadata, origins) where the
 * optimizer's fixpoint check, which compares modules as JSON, does not
 * see it: debug info must not change the generated code.
 */
export function setDebugInfo<K extends "ssaVariables" | "origins">(
  func: Ir.Function,
  key: K,
  value: Ir.Function[K],
): void {
  Object.defineProperty(func, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/** Carry a function's debug info over to a copy of it */
export function copyDebugInfo(from: Ir.Function, to: Ir.Function): void {
  if (from.ssaVariables) setDebugInfo(to, "ssaVariables", from.ssaVariables);
  if (from.origins) setDebugInfo(to, "origins", from.origins);
}
