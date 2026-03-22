import * as Format from "@ethdebug/format";

import type { Type } from "./type.js";
import { Value } from "./value.js";

export type Instruction =
  // Constants
  | Instruction.Const
  // Memory management
  | Instruction.Allocate
  // Unified read/write operations
  | Instruction.Read
  | Instruction.Write
  // Storage slot computation
  | Instruction.ComputeSlot
  // Unified compute operations
  | Instruction.ComputeOffset
  // Arithmetic and logic
  | Instruction.BinaryOp
  | Instruction.UnaryOp
  // Environment access
  | Instruction.Env
  // Type operations
  | Instruction.Hash
  | Instruction.Cast
  // Length operations
  | Instruction.Length;

export namespace Instruction {
  export interface Base {
    kind: string;
    /**
     * Debug context for the operation itself (not operands).
     * Renamed from `debug` to clarify that this tracks only the operation,
     * while operands have their own debug contexts.
     */
    operationDebug: Instruction.Debug;
  }

  export interface Debug {
    context?: Format.Program.Context;
  }

  // Location types for unified read/write
  export type Location =
    | "storage"
    | "transient"
    | "memory"
    | "calldata"
    | "returndata"
    | "code"
    | "local";

  // NEW: Unified Read instruction
  export interface Read extends Instruction.Base {
    kind: "read";
    location: Location;
    // For storage/transient (segment-based)
    slot?: Value;
    slotDebug?: Instruction.Debug;
    // For all locations that need offset
    offset?: Value;
    offsetDebug?: Instruction.Debug;
    // Length in bytes
    length?: Value;
    lengthDebug?: Instruction.Debug;
    // For local variables
    name?: string;
    // Destination and type
    dest: string;
    type: Type;
  }

  // NEW: Unified Write instruction
  export interface Write extends Instruction.Base {
    kind: "write";
    location: Exclude<Location, "calldata" | "returndata" | "code">; // No writes to read-only locations
    // For storage/transient (segment-based)
    slot?: Value;
    slotDebug?: Instruction.Debug;
    // For all locations that need offset
    offset?: Value;
    offsetDebug?: Instruction.Debug;
    // Length in bytes
    length?: Value;
    lengthDebug?: Instruction.Debug;
    // For local variables
    name?: string;
    // Value to write
    value: Value;
    valueDebug?: Instruction.Debug;
  }

  // NEW: Unified compute offset instruction
  export type ComputeOffset =
    | ComputeOffset.Array
    | ComputeOffset.Field
    | ComputeOffset.Byte;

  export namespace ComputeOffset {
    export interface Base extends Instruction.Base {
      kind: "compute_offset";
      offsetKind: "array" | "field" | "byte";
      location: "memory" | "calldata" | "returndata" | "code";
      base: Value;
      baseDebug?: Instruction.Debug;
      dest: string;
    }

    export interface Array extends ComputeOffset.Base {
      offsetKind: "array";
      index: Value;
      indexDebug?: Instruction.Debug;
      stride: number;
    }

    export const isArray = (inst: ComputeOffset): inst is ComputeOffset.Array =>
      inst.offsetKind === "array";

    export const array = (
      location: "memory" | "calldata" | "returndata" | "code",
      base: Value,
      index: Value,
      stride: number,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
      indexDebug?: Instruction.Debug,
    ): ComputeOffset.Array => ({
      kind: "compute_offset",
      offsetKind: "array",
      location,
      base,
      baseDebug,
      index,
      indexDebug,
      stride,
      dest,
      operationDebug,
    });

    export interface Field extends ComputeOffset.Base {
      offsetKind: "field";
      field: string;
      fieldOffset: number;
    }

    export const isField = (inst: ComputeOffset): inst is ComputeOffset.Field =>
      inst.offsetKind === "field";

    export const field = (
      location: "memory" | "calldata" | "returndata" | "code",
      base: Value,
      field: string,
      fieldOffset: number,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
    ): ComputeOffset.Field => ({
      kind: "compute_offset",
      offsetKind: "field",
      location,
      base,
      baseDebug,
      field,
      fieldOffset,
      dest,
      operationDebug,
    });

    export interface Byte extends ComputeOffset.Base {
      offsetKind: "byte";
      offset: Value;
      offsetDebug?: Instruction.Debug;
    }

    export const isByte = (inst: ComputeOffset): inst is ComputeOffset.Byte =>
      inst.offsetKind === "byte";

    export const byte = (
      location: "memory" | "calldata" | "returndata" | "code",
      base: Value,
      offset: Value,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
      offsetDebug?: Instruction.Debug,
    ): ComputeOffset.Byte => ({
      kind: "compute_offset",
      offsetKind: "byte",
      location,
      base,
      baseDebug,
      offset,
      offsetDebug,
      dest,
      operationDebug,
    });
  }

  export interface Const extends Instruction.Base {
    kind: "const";
    value: bigint | string | boolean;
    valueDebug?: Instruction.Debug;
    type: Type;
    dest: string;
  }

  // Memory allocation instruction
  export interface Allocate extends Instruction.Base {
    kind: "allocate";
    location: "memory"; // For now, only memory allocation
    size: Value; // Size in bytes to allocate
    sizeDebug?: Instruction.Debug;
    dest: string; // Destination temp for the allocated pointer
  }

  export type ComputeSlot =
    | ComputeSlot.Mapping
    | ComputeSlot.Array
    | ComputeSlot.Field;

  export namespace ComputeSlot {
    export interface Base extends Instruction.Base {
      kind: "compute_slot";
      slotKind: "mapping" | "array" | "field";
      base: Value;
      baseDebug?: Instruction.Debug;
      dest: string;
    }

    export interface Mapping extends ComputeSlot.Base {
      slotKind: "mapping";
      key: Value;
      keyDebug?: Instruction.Debug;
      keyType: Type;
    }

    export const isMapping = (inst: ComputeSlot): inst is ComputeSlot.Mapping =>
      inst.slotKind === "mapping";

    export const mapping = (
      base: Value,
      key: Value,
      keyType: Type,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
      keyDebug?: Instruction.Debug,
    ): ComputeSlot.Mapping => ({
      kind: "compute_slot",
      slotKind: "mapping",
      base,
      baseDebug,
      key,
      keyDebug,
      keyType,
      dest,
      operationDebug,
    });

    export interface Array extends ComputeSlot.Base {
      slotKind: "array";
      // No index - just computes the first slot of the array
    }

    export const isArray = (inst: ComputeSlot): inst is ComputeSlot.Array =>
      inst.slotKind === "array";

    export const array = (
      base: Value,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
    ): ComputeSlot.Array => ({
      kind: "compute_slot",
      slotKind: "array",
      base,
      baseDebug,
      dest,
      operationDebug,
    });

    export interface Field extends ComputeSlot.Base {
      slotKind: "field";
      fieldOffset: number; // Byte offset from struct base
    }

    export const isField = (inst: ComputeSlot): inst is ComputeSlot.Field =>
      inst.slotKind === "field";

    export const field = (
      base: Value,
      fieldOffset: number,
      dest: string,
      operationDebug: Instruction.Debug,
      baseDebug?: Instruction.Debug,
    ): ComputeSlot.Field => ({
      kind: "compute_slot",
      slotKind: "field",
      base,
      baseDebug,
      fieldOffset,
      dest,
      operationDebug,
    });
  }

  export interface BinaryOp extends Instruction.Base {
    kind: "binary";
    op: // Arithmetic
      | "add"
      | "sub"
      | "mul"
      | "div"
      | "mod"
      // Bitwise
      | "shl"
      | "shr"
      // Comparison
      | "eq"
      | "ne"
      | "lt"
      | "le"
      | "gt"
      | "ge"
      // Logical
      | "and"
      | "or";
    left: Value;
    leftDebug?: Instruction.Debug;
    right: Value;
    rightDebug?: Instruction.Debug;
    dest: string;
  }

  export interface UnaryOp extends Instruction.Base {
    kind: "unary";
    op: "not" | "neg";
    operand: Value;
    operandDebug?: Instruction.Debug;
    dest: string;
  }

  export interface Env extends Instruction.Base {
    kind: "env";
    op:
      | "msg_sender"
      | "msg_value"
      | "msg_data"
      | "block_number"
      | "block_timestamp";

    dest: string;
  }

  export interface Hash extends Instruction.Base {
    kind: "hash";
    value: Value;
    valueDebug?: Instruction.Debug;
    dest: string;
  }

  export interface Cast extends Instruction.Base {
    kind: "cast";
    value: Value;
    valueDebug?: Instruction.Debug;
    targetType: Type;
    dest: string;
  }

  // Call instruction removed - calls are now block terminators

  export interface Length extends Instruction.Base {
    kind: "length";
    object: Value;
    objectDebug?: Instruction.Debug;
    dest: string;
  }
}
