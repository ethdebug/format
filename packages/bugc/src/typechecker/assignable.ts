import { Type } from "#types";

/**
 * Checks if a value type can be assigned to a target type.
 * Handles implicit conversions and type compatibility.
 */
export function isAssignable(target: Type, value: Type): boolean {
  if (Type.isFailure(target) || Type.isFailure(value)) {
    return true;
  }
  if (Type.equals(target, value)) {
    return true;
  }

  // Numeric types can be implicitly converted (with range checks)
  if (
    Type.isElementary(target) &&
    Type.isElementary(value) &&
    Type.Elementary.isNumeric(target) &&
    Type.Elementary.isNumeric(value)
  ) {
    // Only allow same signedness
    if (Type.Elementary.isUint(target) && Type.Elementary.isUint(value)) {
      return true;
    }
    if (Type.Elementary.isInt(target) && Type.Elementary.isInt(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Finds the common type for binary operations.
 * Returns the larger of two compatible types.
 */
export function commonType(type1: Type, type2: Type): Type | null {
  if (Type.equals(type1, type2)) {
    return type1;
  }

  // For numeric types, return the larger type
  if (Type.isElementary(type1) && Type.isElementary(type2)) {
    if (Type.Elementary.isUint(type1) && Type.Elementary.isUint(type2)) {
      const size1 = type1.bits || 256;
      const size2 = type2.bits || 256;
      return size1 >= size2 ? type1 : type2;
    }
    if (Type.Elementary.isInt(type1) && Type.Elementary.isInt(type2)) {
      const size1 = type1.bits || 256;
      const size2 = type2.bits || 256;
      return size1 >= size2 ? type1 : type2;
    }
  }

  return null;
}
