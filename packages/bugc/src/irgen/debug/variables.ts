/**
 * Variable collection utilities for ethdebug/format integration
 *
 * Collects variable information for generating variables contexts
 */

import * as Format from "@ethdebug/format";
import type { State } from "../generate/state.js";
import { generatePointer, type VariableLocation } from "./pointers.js";
import { Type } from "#types";
import { convertBugType } from "./types.js";

/**
 * Information about a variable available for debug contexts
 */
export interface VariableInfo {
  /** Variable identifier (name) */
  identifier: string;

  /** Type information */
  type?: Format.Type;

  /** Runtime location pointer */
  pointer?: Format.Pointer;

  /** Declaration location in source */
  declaration?: Format.Materials.SourceRange;
}

/**
 * Get the size in bytes for a type
 */
function getTypeSize(bugType: Type): number {
  if (Type.isElementary(bugType)) {
    switch (bugType.kind) {
      case "uint":
      case "int":
        return (bugType.bits || 256) / 8;
      case "address":
        return 20;
      case "bool":
        return 1;
      case "bytes":
        return bugType.size || 32; // Dynamic bytes default to full slot
      case "string":
        return 32; // Dynamic string default to full slot
      default:
        return 32;
    }
  }
  // For complex types, default to full slot
  return 32;
}

/**
 * Generate a sophisticated pointer for a storage variable based on its type
 */
function generateStoragePointer(
  baseSlot: number,
  bugType: Type,
  byteOffset: number = 0,
): Format.Pointer | undefined {
  // For structs, generate a group pointer with each field
  if (Type.isStruct(bugType)) {
    const group: Array<Format.Pointer & { name?: string }> = [];

    for (const [fieldName, fieldType] of bugType.fields) {
      const layout = bugType.layout.get(fieldName);
      if (!layout) continue;

      const absoluteOffset = byteOffset + layout.byteOffset;
      const fieldSlot = baseSlot + Math.floor(absoluteOffset / 32);
      const fieldOffset = absoluteOffset % 32;

      const fieldPointer = generateStoragePointer(
        fieldSlot,
        fieldType,
        fieldOffset,
      );
      if (!fieldPointer) continue;

      group.push({ ...fieldPointer, name: fieldName });
    }

    if (group.length === 0) {
      return undefined;
    }

    return { group };
  }

  // For arrays, generate a list pointer
  if (Type.isArray(bugType)) {
    const elementType = bugType.element;
    const elementSize = getTypeSize(elementType);

    // Check if this is a fixed-size or dynamic array
    if (bugType.size !== undefined) {
      // Fixed-size array: elements stored sequentially from base slot
      // For fixed arrays, elements are at baseSlot + floor((i * elementSize) / 32)
      // with offset (i * elementSize) % 32
      const elementSlotExpression: Format.Pointer.Expression =
        elementSize >= 32
          ? // Full slots: baseSlot + i * (elementSize / 32)
            {
              $sum: [baseSlot, { $product: ["i", elementSize / 32] }],
            }
          : // Packed elements: baseSlot + floor((i * elementSize) / 32)
            {
              $sum: [
                baseSlot,
                {
                  $quotient: [{ $product: ["i", elementSize] }, 32],
                },
              ],
            };

      const elementPointer: Format.Pointer = {
        name: "element",
        location: "storage",
        slot: elementSlotExpression,
      };

      // Add offset for packed elements
      if (elementSize < 32) {
        elementPointer.offset = {
          $remainder: [{ $product: ["i", elementSize] }, 32],
        };
        elementPointer.length = elementSize;
      }

      // Recursively handle complex element types
      const refinedPointer =
        Type.isStruct(elementType) || Type.isArray(elementType)
          ? generateStoragePointer(0, elementType, 0)
          : elementPointer;

      return {
        list: {
          count: bugType.size,
          each: "i",
          is: refinedPointer || elementPointer,
        },
      };
    } else {
      // Dynamic array: length at base slot, elements at keccak256(slot) + index
      // Elements start at keccak256(baseSlot)
      // Note: baseSlot must be wordsized for proper 32-byte keccak256 input
      const elementSlotExpression: Format.Pointer.Expression =
        elementSize >= 32
          ? // Full slots: keccak256(baseSlot) + i * (elementSize / 32)
            {
              $sum: [
                { $keccak256: [{ $wordsized: baseSlot }] },
                { $product: ["i", elementSize / 32] },
              ],
            }
          : // Packed elements: keccak256(baseSlot) + floor((i * elementSize) / 32)
            {
              $sum: [
                { $keccak256: [{ $wordsized: baseSlot }] },
                {
                  $quotient: [{ $product: ["i", elementSize] }, 32],
                },
              ],
            };

      const elementPointer: Format.Pointer = {
        name: "element",
        location: "storage",
        slot: elementSlotExpression,
      };

      // Add offset for packed elements
      if (elementSize < 32) {
        elementPointer.offset = {
          $remainder: [{ $product: ["i", elementSize] }, 32],
        };
        elementPointer.length = elementSize;
      }

      // Recursively handle complex element types
      const refinedPointer =
        Type.isStruct(elementType) || Type.isArray(elementType)
          ? generateStoragePointer(0, elementType, 0)
          : elementPointer;

      // For dynamic arrays, we use a group to declare both the length region
      // and the list of elements
      // Note: "array-length" avoids conflict with Array.prototype.length
      const lengthRegion: Format.Pointer = {
        name: "array-length",
        location: "storage",
        slot: baseSlot,
      };
      if (byteOffset > 0) {
        lengthRegion.offset = byteOffset;
      }

      return {
        group: [
          lengthRegion,
          {
            list: {
              count: { $read: "array-length" },
              each: "i",
              is: refinedPointer || elementPointer,
            },
          },
        ],
      };
    }
  }

  // For mappings, we can't represent them without keys
  // Just return the base slot pointer with offset/length
  if (Type.isMapping(bugType)) {
    const pointer: Format.Pointer = {
      location: "storage",
      slot: baseSlot,
    };
    if (byteOffset > 0) {
      pointer.offset = byteOffset;
    }
    return pointer;
  }

  // For elementary types, generate pointer with offset and length
  const size = getTypeSize(bugType);
  const pointer: Format.Pointer = {
    location: "storage",
    slot: baseSlot,
  };

  if (byteOffset > 0) {
    pointer.offset = byteOffset;
  }

  if (size < 32) {
    pointer.length = size;
  }

  return pointer;
}

/**
 * Collect all variables with determinable locations from current state
 *
 * At IR generation time, we can only include variables that have
 * concrete runtime locations:
 * - Storage variables (fixed or computed slots)
 * - Memory allocations (if tracked)
 *
 * SSA temps are NOT included because they don't have concrete runtime
 * locations until EVM code generation.
 */
export function collectVariablesWithLocations(
  state: State,
  sourceId: string,
): VariableInfo[] {
  const variables: VariableInfo[] = [];

  // Collect storage variables - these have fixed/known slots
  for (const storageDecl of state.module.storageDeclarations) {
    // Get the resolved BugType from the typechecker
    const bugType = state.types.get(storageDecl.id);
    if (!bugType) {
      // Fallback to simple pointer if no type info
      const location: VariableLocation = {
        kind: "storage",
        slot: storageDecl.slot,
      };
      const pointer = generatePointer(location);
      if (pointer) {
        variables.push({
          identifier: storageDecl.name,
          pointer,
          declaration: storageDecl.loc
            ? {
                source: { id: sourceId },
                range: storageDecl.loc,
              }
            : undefined,
        });
      }
      continue;
    }

    // Generate sophisticated pointer based on type
    const pointer = generateStoragePointer(storageDecl.slot, bugType);
    if (!pointer) continue;

    // Convert Bug type to ethdebug format type
    const type = convertBugType(bugType);

    const declaration: Format.Materials.SourceRange | undefined =
      storageDecl.loc
        ? {
            source: { id: sourceId },
            range: storageDecl.loc,
          }
        : undefined;

    variables.push({
      identifier: storageDecl.name,
      type,
      pointer,
      declaration,
    });
  }

  // TODO: Add memory-allocated variables when we track memory allocations
  // For now, we skip memory variables as we don't track their offsets yet

  // Note: We do NOT include SSA temps here because they don't have
  // concrete runtime locations (stack positions) until EVM codegen

  return variables;
}

/**
 * Convert VariableInfo to ethdebug/format variable context entry
 */
export function toVariableContextEntry(
  variable: VariableInfo,
): Format.Program.Context.Variables["variables"][number] {
  const entry: Format.Program.Context.Variables["variables"][number] = {
    identifier: variable.identifier,
  };

  if (variable.type) {
    entry.type = variable.type;
  }

  if (variable.pointer) {
    entry.pointer = variable.pointer;
  }

  if (variable.declaration) {
    entry.declaration = variable.declaration;
  }

  return entry;
}
