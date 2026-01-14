import * as Ir from "#ir";

/**
 * Get the size of a type in bytes
 */
export function getTypeSize(type: Ir.Type): bigint {
  switch (type.kind) {
    case "scalar":
      return BigInt(type.size);
    case "ref":
      return 32n; // references are always 32 bytes (pointer/slot)
    default:
      return 32n; // default to word size
  }
}

/**
 * Get the element size for sliceable types
 * Returns the size of each element in bytes
 */
export function getSliceElementSize(type: Ir.Type): bigint {
  // With the new type system, we need to examine the origin
  // to understand what kind of data this is
  // For now, we'll use conservative defaults
  if (type.kind === "ref") {
    // References to arrays/strings/bytes
    // Arrays: elements are 32-byte padded
    // Strings/bytes: elements are 1 byte
    // Without origin information, default to 1 byte (conservative for slicing)
    return 1n;
  }
  throw new Error(`Cannot slice type ${type.kind}`);
}
/**
 * Get the offset where actual data starts for sliceable types.
 * For dynamic bytes/strings in memory, data starts after the 32-byte length field.
 * For fixed-size bytes and arrays, data starts immediately.
 */
export function getSliceDataOffset(type: Ir.Type): bigint {
  // With the new type system, dynamic data (refs) have a length field
  if (type.kind === "ref") {
    // Dynamic data in memory has a 32-byte length field before the data
    return 32n;
  }
  if (type.kind === "scalar") {
    // Fixed-size data has no length field
    return 0n;
  }
  // This should never happen as we've covered all type kinds
  // But TypeScript doesn't know that, so we need to handle it
  throw new Error(`Cannot get data offset for unknown type`);
}
