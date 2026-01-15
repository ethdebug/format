/**
 * IR Type System
 *
 * A minimal type system that accurately represents EVM semantics.
 *
 * Core principles:
 * 1. The EVM stack only holds 32-byte values
 * 2. Dynamic data lives in memory/storage/calldata and is accessed via references
 * 3. All types are either scalar values or references to data
 * 4. Type safety comes from knowing data size and location
 * 5. All types track their origin from the Bug type system
 */

import { Type as BugType } from "#types";

/**
 * The complete IR type system
 */
export type Type = Type.Scalar | Type.Ref;

export namespace Type {
  /**
   * Base interface for all types
   */
  export interface Base {
    kind: string;
  }

  export const isBase = (type: unknown): type is Type.Base =>
    typeof type === "object" &&
    !!type &&
    "kind" in type &&
    typeof type.kind === "string";

  /**
   * Origin type - where this IR type came from
   */
  export type Origin = BugType | "synthetic";

  /**
   * Scalar types - raw byte values on the stack
   * Size ranges from 1 to 32 bytes
   */
  export interface Scalar extends Type.Base {
    kind: "scalar";
    size:
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7
      | 8
      | 9
      | 10
      | 11
      | 12
      | 13
      | 14
      | 15
      | 16
      | 17
      | 18
      | 19
      | 20
      | 21
      | 22
      | 23
      | 24
      | 25
      | 26
      | 27
      | 28
      | 29
      | 30
      | 31
      | 32;
    origin: Type.Origin;
  }

  /**
   * Create a scalar type of the specified size
   */
  export const scalar = (
    size: Type.Scalar["size"],
    origin: Type.Origin,
  ): Type.Scalar => ({
    kind: "scalar",
    size,
    origin,
  });

  export const isScalar = (type: Type.Base): type is Type.Scalar =>
    type.kind === "scalar" &&
    "size" in type &&
    typeof (type as Type.Scalar).size === "number" &&
    (type as Type.Scalar).size >= 1 &&
    (type as Type.Scalar).size <= 32 &&
    "origin" in type;

  export namespace Scalar {
    /**
     * Export the size type for external use
     */
    export type Size = Type.Scalar["size"];

    /**
     * Create synthetic scalar types (for IR-generated values)
     */
    export const synthetic = (size: Size): Type.Scalar =>
      Type.scalar(size, "synthetic");

    /**
     * Common synthetic scalar types
     */
    export const bytes1 = synthetic(1);
    export const bytes4 = synthetic(4);
    export const bytes8 = synthetic(8);
    export const bytes20 = synthetic(20); // address size
    export const bytes32 = synthetic(32); // word size

    /**
     * Semantic aliases for synthetic types
     */
    export const uint8 = bytes1;
    export const uint32 = bytes4;
    export const uint64 = bytes8;
    export const uint256 = bytes32;
    export const int8 = bytes1;
    export const int256 = bytes32;
    export const address = bytes20;
    export const bool = bytes1;
    export const word = bytes32;

    /**
     * Check equality
     */
    export const equals = (a: Type.Scalar, b: Type.Scalar): boolean =>
      a.size === b.size && a.origin === b.origin; // Note: this is reference equality for Bug types

    /**
     * Format for display
     */
    export const format = (type: Type.Scalar): string => {
      const sizeStr = `scalar${type.size}`;
      if (type.origin === "synthetic") {
        return sizeStr;
      }
      // Could format with Bug type info if desired
      return `${sizeStr}[${BugType.format(type.origin)}]`;
    };
  }

  /**
   * Reference types - pointers to data in various locations
   */
  export interface Ref extends Type.Base {
    kind: "ref";
    location: Type.Ref.Location;
    origin: Type.Origin;
  }

  /**
   * Create a reference type
   */
  export const ref = (
    location: Type.Ref.Location,
    origin: Type.Origin,
  ): Type.Ref => ({
    kind: "ref",
    location,
    origin,
  });

  export const isRef = (type: Type.Base): type is Type.Ref =>
    type.kind === "ref" &&
    "location" in type &&
    typeof (type as Type.Ref).location === "string" &&
    ["memory", "storage", "calldata", "returndata", "transient"].includes(
      (type as Type.Ref).location,
    ) &&
    "origin" in type;

  export namespace Ref {
    /**
     * Where the referenced data lives
     */
    export type Location =
      | "memory"
      | "storage"
      | "calldata"
      | "returndata"
      | "transient";

    /**
     * Create synthetic reference types (for IR-generated references)
     */
    export const synthetic = (location: Type.Ref.Location): Type.Ref =>
      Type.ref(location, "synthetic");

    /**
     * Common synthetic reference types
     */
    export const memory = () => synthetic("memory");
    export const storage = () => synthetic("storage");
    export const calldata = () => synthetic("calldata");
    export const returndata = () => synthetic("returndata");
    export const transient = () => synthetic("transient");

    /**
     * Check equality
     */
    export const equals = (a: Type.Ref, b: Type.Ref): boolean =>
      a.location === b.location && a.origin === b.origin; // Note: this is reference equality for Bug types

    /**
     * Format for display
     */
    export const format = (type: Type.Ref): string => {
      const locStr = `ref<${type.location}>`;
      if (type.origin === "synthetic") {
        return locStr;
      }
      // Include Bug type info
      return `${locStr}[${BugType.format(type.origin)}]`;
    };
  }

  /**
   * Type equality check
   */
  export const equals = (a: Type, b: Type): boolean => {
    if (a.kind !== b.kind) return false;

    if (Type.isScalar(a) && Type.isScalar(b)) {
      return Type.Scalar.equals(a, b);
    }

    if (Type.isRef(a) && Type.isRef(b)) {
      return Type.Ref.equals(a, b);
    }

    return false;
  };

  /**
   * Format type for display
   */
  export const format = (type: Type): string => {
    if (Type.isScalar(type)) {
      return Type.Scalar.format(type);
    }

    if (Type.isRef(type)) {
      return Type.Ref.format(type);
    }

    return "unknown";
  };
}
