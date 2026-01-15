import { Type } from "../types/index.js";

/**
 * Compute storage layout for a struct's fields.
 * Implements Solidity-style packing where fields are packed together
 * if they fit within 32-byte slots.
 */
export function computeStructLayout(
  fields: Map<string, Type>,
): Map<string, Type.FieldLayout> {
  const layout = new Map<string, Type.FieldLayout>();
  let currentSlotOffset = 0; // Byte offset from start of struct
  let currentSlotUsed = 0; // Bytes used in current slot
  const SLOT_SIZE = 32;

  for (const [fieldName, fieldType] of fields) {
    const size = getTypeSize(fieldType);
    const isDynamic = isTypeDynamic(fieldType);

    // Dynamic types always start a new slot
    if (isDynamic) {
      // If we've used any of the current slot, move to next slot
      if (currentSlotUsed > 0) {
        currentSlotOffset += SLOT_SIZE;
        currentSlotUsed = 0;
      }

      layout.set(fieldName, {
        byteOffset: currentSlotOffset,
        size: SLOT_SIZE, // Dynamic types use full slot for reference
      });

      // Move to next slot
      currentSlotOffset += SLOT_SIZE;
      currentSlotUsed = 0;
    } else {
      // For non-dynamic types, try to pack them
      // If this field doesn't fit in the current slot, start a new slot
      if (currentSlotUsed + size > SLOT_SIZE) {
        currentSlotOffset += SLOT_SIZE;
        currentSlotUsed = 0;
      }

      // Place field in current slot
      layout.set(fieldName, {
        byteOffset: currentSlotOffset + currentSlotUsed,
        size: size,
      });

      currentSlotUsed += size;

      // If we've filled the slot exactly, prepare for next slot
      if (currentSlotUsed >= SLOT_SIZE) {
        currentSlotOffset += SLOT_SIZE;
        currentSlotUsed = 0;
      }
    }
  }

  return layout;
}

/**
 * Check if a type is dynamic (requires its own slot).
 */
function isTypeDynamic(type: Type): boolean {
  switch (type.kind) {
    case "string":
    case "array":
    case "mapping":
      return true;
    case "bytes":
      // Dynamic bytes (no fixed size) are dynamic
      return type.size === undefined;
    case "struct":
      // Structs are considered dynamic for simplicity
      // (in reality, they could be packed if all fields are static)
      return true;
    default:
      return false;
  }
}

/**
 * Get the storage size of a type in bytes.
 * For storage, values are padded to 32 bytes.
 */
function getTypeSize(type: Type): number {
  switch (type.kind) {
    case "bool":
      return 1;
    case "uint":
    case "int":
      return Math.ceil(type.bits / 8);
    case "address":
      return 20;
    case "bytes":
      return type.size || 32; // Fixed-size bytes or dynamic
    case "string":
    case "array":
    case "mapping":
    case "struct":
      return 32; // Reference types take full slot
    default:
      return 32;
  }
}
