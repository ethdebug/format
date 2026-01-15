import * as Ir from "#ir";
import { Type as BugType } from "#types";
import { Error as IrgenError, ErrorCode, assertExhausted } from "./errors.js";
import { Severity } from "#result";

export function fromBugType(type: BugType): Ir.Type {
  if (BugType.isFailure(type) || BugType.isFunction(type)) {
    // Error type should already have diagnostics added elsewhere
    throw new IrgenError(
      `Cannot convert type with kind ${type.kind} to IR type`,
      undefined,
      Severity.Error,
      ErrorCode.UNKNOWN_TYPE,
    );
  }

  // Arrays, mappings, structs, and dynamic types become references
  if (BugType.isArray(type)) {
    // Arrays are memory references when not in storage
    return Ir.Type.ref("memory", type);
  }

  if (BugType.isMapping(type)) {
    // Mappings are always storage references
    return Ir.Type.ref("storage", type);
  }

  if (BugType.isStruct(type)) {
    // Structs are memory references when not in storage
    return Ir.Type.ref("memory", type);
  }

  if (BugType.isElementary(type)) {
    switch (type.kind) {
      case "uint": {
        // Uints become scalars
        const bits = type.bits || 256;
        return Ir.Type.scalar((bits / 8) as Ir.Type.Scalar.Size, type);
      }
      case "int": {
        // BUG language doesn't have signed ints, treat as uint
        const intBits = type.bits || 256;
        return Ir.Type.scalar((intBits / 8) as Ir.Type.Scalar.Size, type);
      }
      case "address":
        // Addresses are 20-byte scalars
        return Ir.Type.scalar(20, type);
      case "bool":
        // Bools are 1-byte scalars
        return Ir.Type.scalar(1, type);
      case "bytes":
        if (type.size) {
          // Fixed-size bytes are scalars
          return Ir.Type.scalar(type.size as Ir.Type.Scalar.Size, type);
        } else {
          // Dynamic bytes are memory references
          return Ir.Type.ref("memory", type);
        }
      case "string":
        // Strings are always memory references
        return Ir.Type.ref("memory", type);
      default:
        assertExhausted(type);
    }
  }

  assertExhausted(type);
}
