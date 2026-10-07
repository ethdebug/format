/**
 * Storage layout, as Solidity lays storage out.
 *
 * A value narrower than a slot takes only its own bytes, and values
 * that fit share a slot, from its low-order end. An array, a struct, a
 * mapping, a string or dynamic bytes starts a slot of its own, and what
 * follows it starts the next slot. A fixed-size array is inline: its
 * elements start at its own slot. A dynamic array keeps its length in
 * its slot, and its elements start at keccak256(slot).
 */
import { Type } from "./spec.js";

/** The bytes a value of an elementary type takes, if it has a size */
export function size(type: Type): number | undefined {
  if (!Type.isElementary(type)) return undefined;
  switch (type.kind) {
    case "uint":
    case "int":
      return Math.ceil(type.bits / 8);
    case "address":
      return 20;
    case "bool":
      return 1;
    case "bytes":
      return type.size;
    default:
      return undefined;
  }
}

/** How many elements of an array of `element` share each slot */
export function elementsPerSlot(element: Type): number {
  const bytes = size(element);
  return bytes === undefined ? 1 : Math.floor(32 / bytes);
}

/** How many slots a value of the type takes */
export function slots(type: Type): number {
  if (Type.isArray(type)) {
    if (type.size === undefined) return 1;
    const perSlot = elementsPerSlot(type.element);
    return perSlot > 1
      ? Math.ceil(type.size / perSlot)
      : type.size * slots(type.element);
  }
  if (Type.isStruct(type)) {
    let end = 0;
    for (const { byteOffset, size } of type.layout.values()) {
      end = Math.max(end, byteOffset + size);
    }
    return Math.max(1, Math.ceil(end / 32));
  }
  return 1;
}
