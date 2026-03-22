/**
 * Pointer generation utilities for ethdebug/format integration
 *
 * Converts runtime variable locations to ethdebug/format pointer
 * expressions
 */
import * as Format from "@ethdebug/format";

import type * as Ir from "#ir/spec";

import type { ComputeSlotChain } from "./storage-analysis.js";

/**
 * Variable location information
 */
export type VariableLocation =
  | { kind: "storage"; slot: number | bigint }
  | { kind: "storage-computed"; expression: Format.Pointer.Expression }
  | {
      kind: "memory";
      offset: number | bigint;
      length: number | bigint;
    }
  | {
      kind: "memory-computed";
      offsetExpression: Format.Pointer.Expression;
      lengthExpression: Format.Pointer.Expression;
    }
  | {
      kind: "calldata";
      offset: number | bigint;
      length: number | bigint;
    }
  | { kind: "stack"; slot: number }
  | { kind: "transient"; slot: number | bigint }
  | { kind: "unknown" };

/**
 * Generate an ethdebug/format pointer for a variable location
 */
export function generatePointer(
  location: VariableLocation,
): Format.Pointer | undefined {
  switch (location.kind) {
    case "storage":
      return {
        location: "storage",
        slot: Number(location.slot),
      };

    case "storage-computed":
      return {
        location: "storage",
        slot: location.expression,
      };

    case "memory":
      return {
        location: "memory",
        offset: Number(location.offset),
        length: Number(location.length),
      };

    case "memory-computed":
      return {
        location: "memory",
        offset: location.offsetExpression,
        length: location.lengthExpression,
      };

    case "calldata":
      return {
        location: "calldata",
        offset: Number(location.offset),
        length: Number(location.length),
      };

    case "transient":
      return {
        location: "transient",
        slot: Number(location.slot),
      };

    case "stack":
      // Stack-based SSA temps don't have concrete runtime locations yet
      // at IR generation time. They only get stack positions during
      // EVM code generation. So we can't generate pointers for them here.
      return undefined;

    case "unknown":
      return undefined;
  }
}

/**
 * Translate a compute_slot chain to an ethdebug/format pointer expression
 *
 * Takes a chain of compute_slot instructions and generates the corresponding
 * pointer expression using $keccak256, $sum, and other operations.
 *
 * SAFETY: Handles unknown patterns gracefully by returning simple expressions.
 * Never crashes - just returns best-effort pointer.
 *
 * @param chain The compute_slot chain from storage-analysis
 * @returns A pointer expression (simple number or complex expression)
 */
export function translateComputeSlotChain(
  chain: ComputeSlotChain,
): Format.Pointer.Expression {
  // Start with base slot
  if (chain.baseSlot === null) {
    // Couldn't determine base - this shouldn't happen if chain is valid
    // Return 0 as fallback
    return 0;
  }

  let expr: Format.Pointer.Expression = chain.baseSlot;

  // Process each step in the chain
  for (const step of chain.steps) {
    const inst = step.instruction;

    if (inst.slotKind === "mapping") {
      // Mapping access: keccak256(wordsized(key), slot)
      // Try to convert key to expression
      const keyExpr = valueToExpression(step.key);
      if (keyExpr !== null) {
        expr = {
          $keccak256: [{ $wordsized: keyExpr }, expr],
        };
      }
      // If we can't convert the key, skip this step (use current expr)
    } else if (inst.slotKind === "array") {
      // Array base: keccak256(slot)
      // Note: actual element access is done with binary.add afterward
      // which we don't see in the compute_slot chain
      expr = {
        $keccak256: [expr],
      };
    } else if (inst.slotKind === "field") {
      // Struct field: slot + fieldSlotOffset
      const slotOffset = step.fieldSlotOffset ?? 0;
      if (slotOffset > 0) {
        expr = {
          $sum: [expr, slotOffset],
        };
      }
      // If offset is 0, no change needed
    }
    // Unknown slotKind: skip (shouldn't happen)
  }

  return expr;
}

/**
 * Convert an IR value to a pointer expression
 *
 * SAFETY: Returns null if we can't convert the value
 * For now, only handles constants. Future: handle temp references.
 */
function valueToExpression(
  value: Ir.Value | undefined,
): Format.Pointer.Expression | null {
  if (!value) {
    return null;
  }

  // Handle constant values
  if (value.kind === "const" && typeof value.value === "bigint") {
    return Number(value.value);
  }

  // Handle temp references
  // For now, we can't represent these in pointer expressions
  // Future: could use region references or symbolic names
  if (value.kind === "temp") {
    // Can't represent temp in pointer expression yet
    return null;
  }

  return null;
}

/**
 * Helper to create pointer expression for mapping access
 *
 * Generates: keccak256(concat(key, slot))
 */
export function mappingAccess(
  slot: number | Format.Pointer.Expression,
  key: Format.Pointer.Expression,
): Format.Pointer.Expression {
  return {
    $keccak256: [{ $wordsized: key }, slot],
  };
}

/**
 * Helper to create pointer expression for array element access
 *
 * For dynamic arrays: slot for length, keccak256(slot) + index for elements
 * For fixed arrays: slot + index
 */
export function arrayElementAccess(
  baseSlot: number | Format.Pointer.Expression,
  index: number | Format.Pointer.Expression,
  isDynamic: boolean,
): Format.Pointer.Expression {
  if (isDynamic) {
    // Dynamic array: keccak256(slot) + index
    return {
      $sum: [{ $keccak256: [baseSlot] }, index],
    };
  } else {
    // Fixed array: slot + index
    return {
      $sum: [baseSlot, index],
    };
  }
}

/**
 * Helper to create pointer expression for struct field access
 *
 * Generates: slot + fieldOffset
 */
export function structFieldAccess(
  baseSlot: number | Format.Pointer.Expression,
  fieldOffset: number,
): Format.Pointer.Expression {
  if (fieldOffset === 0) {
    return baseSlot;
  }

  return {
    $sum: [baseSlot, fieldOffset],
  };
}
