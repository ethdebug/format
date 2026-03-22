/**
 * Type conversion utilities for ethdebug/format integration
 *
 * Converts IR types to ethdebug/format type schemas for variable contexts
 */

import * as Format from "@ethdebug/format";
import * as Ir from "#ir";
import { Type as BugType } from "#types";

/**
 * Convert an IR type to an ethdebug/format type
 *
 * The IR type system is minimal (scalars and refs), but each IR type
 * carries its origin from the Bug type system, which contains rich
 * semantic information we can use to generate proper ethdebug types.
 */
export function convertToEthDebugType(
  irType: Ir.Type,
): Format.Type | undefined {
  // If we have a Bug type origin, use it for rich type information
  if (irType.origin !== "synthetic" && BugType.isBase(irType.origin)) {
    return convertBugType(irType.origin);
  }

  // For synthetic types (IR-generated), infer from IR type structure
  return convertSyntheticType(irType);
}

/**
 * Convert a Bug type to ethdebug/format type
 *
 * Bug types contain full semantic information about the original
 * source language type
 */
export function convertBugType(bugType: BugType): Format.Type | undefined {
  // Elementary types
  if (BugType.isElementary(bugType)) {
    return convertElementaryType(bugType);
  }

  // Array types
  if (BugType.isArray(bugType)) {
    const elementType = convertBugType(bugType.element);
    if (!elementType) {
      return undefined;
    }

    return {
      kind: "array",
      contains: {
        type: elementType,
      },
      ...(bugType.size !== undefined && { length: bugType.size }),
    };
  }

  // Mapping types
  if (BugType.isMapping(bugType)) {
    const keyType = convertBugType(bugType.key);
    const valueType = convertBugType(bugType.value);

    if (!keyType || !valueType) {
      return undefined;
    }

    return {
      kind: "mapping",
      contains: {
        key: { type: keyType },
        value: { type: valueType },
      },
    };
  }

  // Struct types
  if (BugType.isStruct(bugType)) {
    const contains: Array<{ type: Format.Type; name?: string }> = [];

    for (const [fieldName, fieldType] of bugType.fields) {
      const convertedField = convertBugType(fieldType);
      if (convertedField) {
        contains.push({
          name: fieldName,
          type: convertedField,
        });
      }
    }

    return {
      kind: "struct",
      contains,
    };
  }

  // Function types (if needed for function pointers)
  if (BugType.isFunction(bugType)) {
    // ethdebug/format may not have full function type support yet
    // For now, represent as an opaque type or skip
    return undefined;
  }

  return undefined;
}

/**
 * Convert an elementary Bug type to ethdebug/format
 */
function convertElementaryType(
  elementary: BugType.Elementary,
): Format.Type | undefined {
  const { kind } = elementary;

  switch (kind) {
    case "uint":
      return {
        kind: "uint",
        bits: elementary.bits,
      };

    case "int":
      return {
        kind: "int",
        bits: elementary.bits,
      };

    case "address":
      return {
        kind: "address",
        // payable is optional, omit if unknown
      };

    case "bool":
      return {
        kind: "bool",
      };

    case "bytes": {
      if (elementary.size !== undefined) {
        // Fixed-size bytes (bytes1 - bytes32)
        return {
          kind: "bytes",
          size: elementary.size,
        };
      } else {
        // Dynamic bytes
        return {
          kind: "bytes",
        };
      }
    }

    case "string":
      return {
        kind: "string",
      };

    default:
      return undefined;
  }
}

/**
 * Convert a synthetic IR type to ethdebug/format
 *
 * For IR-generated types without Bug type origin, we infer what we can
 * from the IR type structure
 */
function convertSyntheticType(irType: Ir.Type): Format.Type | undefined {
  if (Ir.Type.isScalar(irType)) {
    // Scalar types - infer based on size
    const bits = irType.size * 8;

    // Common patterns for synthetic scalars
    if (irType.size === 32) {
      // Most 32-byte scalars are uint256
      return { kind: "uint", bits: 256 };
    }

    if (irType.size === 20) {
      // 20-byte scalars are addresses
      return { kind: "address" };
    }

    if (irType.size === 1) {
      // 1-byte scalars could be bool or uint8
      // Default to uint8 for safety
      return { kind: "uint", bits: 8 };
    }

    // For other sizes, use uint with appropriate bit size
    return { kind: "uint", bits };
  }

  if (Ir.Type.isRef(irType)) {
    // Reference types don't directly map to ethdebug types
    // They represent pointers, not the data itself
    // The actual type would need to come from Bug type origin
    return undefined;
  }

  return undefined;
}
