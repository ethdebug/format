import * as Ast from "#ast";
import { Type, recordBinding } from "#types";
import type { Bindings } from "#types";
import { Result } from "#result";
import { Error as TypeError, ErrorCode, ErrorMessages } from "./errors.js";
import { computeStructLayout } from "./layout.js";

export interface Declarations {
  readonly structs: Map<string, Declaration.Struct>;
  readonly functions: Map<string, Declaration.Function>;
}

export interface Declaration<T extends Type, N extends Ast.Declaration> {
  node: N;
  type: T;
}

export namespace Declaration {
  export type Struct = Declaration<Type.Struct, Ast.Declaration.Struct>;
  export type Function = Declaration<Type.Function, Ast.Declaration.Function>;
}

/**
 * Collects all type declarations from a program without traversing expressions.
 * This includes struct definitions and function signatures.
 */
export function collectDeclarations(
  program: Ast.Program,
): Result<Declarations, TypeError> {
  const structs = new Map<string, Declaration.Struct>();
  const functions = new Map<string, Declaration.Function>();
  const errors: TypeError[] = [];

  // First pass: collect all struct types
  for (const decl of program.definitions?.items || []) {
    if (Ast.Declaration.isStruct(decl)) {
      try {
        const structType = buildStructType(decl, structs);
        structs.set(decl.name, {
          node: decl,
          type: structType,
        });
      } catch (e) {
        if (e instanceof TypeError) {
          errors.push(e);
        }
      }
    }
  }

  // Second pass: collect function signatures (may reference structs)
  for (const decl of program.definitions?.items || []) {
    if (Ast.Declaration.isFunction(decl)) {
      try {
        const funcType = buildFunctionSignature(decl, structs);
        functions.set(decl.name, {
          node: decl,
          type: funcType,
        });
      } catch (e) {
        if (e instanceof TypeError) {
          errors.push(e);
        }
      }
    }
  }

  if (errors.length > 0) {
    return Result.err(errors);
  }
  return Result.ok({ structs, functions });
}

/**
 * Builds a Type.Struct from a struct declaration
 */
function buildStructType(
  decl: Ast.Declaration.Struct,
  existingStructs: Map<string, Declaration.Struct>,
): Type.Struct {
  const fields = new Map<string, Type>();

  for (const field of decl.fields) {
    if (Ast.Declaration.isField(field) && field.type) {
      const fieldType = resolveType(field.type, existingStructs);
      fields.set(field.name, fieldType);
    }
  }

  // Compute storage layout for the struct
  const layout = computeStructLayout(fields);

  return Type.struct(decl.name, fields, layout);
}

/**
 * Builds a Type.Function from a function declaration
 */
function buildFunctionSignature(
  decl: Ast.Declaration.Function,
  structTypes: Map<string, Declaration.Struct>,
): Type.Function {
  // Resolve parameter types
  const parameterTypes: Type[] = [];
  for (const param of decl.parameters) {
    const paramType = resolveType(param.type, structTypes);
    parameterTypes.push(paramType);
  }

  // Resolve return type (null for void functions)
  const returnType = decl.returnType
    ? resolveType(decl.returnType, structTypes)
    : null;

  return Type.function_(parameterTypes, returnType, decl.name);
}

/**
 * Resolves an AST type node to a Type object and records bindings
 */
export function resolveTypeWithBindings(
  typeNode: Ast.Type,
  structTypes: Map<string, Declaration.Struct>,
  bindings: Bindings,
): { type: Type; bindings: Bindings } {
  if (Ast.Type.isElementary(typeNode)) {
    // Map elementary types based on kind and bits
    if (Ast.Type.Elementary.isUint(typeNode)) {
      const typeMap: Record<number, Type> = {
        256: Type.Elementary.uint(256),
        128: Type.Elementary.uint(128),
        64: Type.Elementary.uint(64),
        32: Type.Elementary.uint(32),
        16: Type.Elementary.uint(16),
        8: Type.Elementary.uint(8),
      };
      return {
        type:
          typeMap[typeNode.bits || 256] ||
          Type.failure(`Unknown uint size: ${typeNode.bits}`),
        bindings,
      };
    }

    if (Ast.Type.Elementary.isInt(typeNode)) {
      const typeMap: Record<number, Type> = {
        256: Type.Elementary.int(256),
        128: Type.Elementary.int(128),
        64: Type.Elementary.int(64),
        32: Type.Elementary.int(32),
        16: Type.Elementary.int(16),
        8: Type.Elementary.int(8),
      };
      return {
        type:
          typeMap[typeNode.bits || 256] ||
          Type.failure(`Unknown int size: ${typeNode.bits}`),
        bindings,
      };
    }

    if (Ast.Type.Elementary.isBytes(typeNode)) {
      if (!typeNode.size) {
        return { type: Type.Elementary.bytes(), bindings }; // Dynamic bytes
      }
      // typeNode.bits now contains the byte size directly (e.g., 32 for bytes32)
      const validSizes = [4, 8, 16, 32];
      if (validSizes.includes(typeNode.size)) {
        return { type: Type.Elementary.bytes(typeNode.size), bindings };
      } else {
        return {
          type: Type.failure(`Unknown bytes size: ${typeNode.size}`),
          bindings,
        };
      }
    }
    if (Ast.Type.Elementary.isAddress(typeNode)) {
      return { type: Type.Elementary.address(), bindings };
    }
    if (Ast.Type.Elementary.isBool(typeNode)) {
      return { type: Type.Elementary.bool(), bindings };
    }
    if (Ast.Type.Elementary.isString(typeNode)) {
      return { type: Type.Elementary.string(), bindings };
    }
    return {
      type: Type.failure(`Unknown elementary type: ${typeNode.kind}`),
      bindings,
    };
  }

  if (Ast.Type.isComplex(typeNode)) {
    if (Ast.Type.Complex.isArray(typeNode)) {
      const elementResult = resolveTypeWithBindings(
        typeNode.element,
        structTypes,
        bindings,
      );
      return {
        type: Type.array(elementResult.type, typeNode.size),
        bindings: elementResult.bindings,
      };
    }
    if (Ast.Type.Complex.isMapping(typeNode)) {
      const keyResult = resolveTypeWithBindings(
        typeNode.key,
        structTypes,
        bindings,
      );
      const valueResult = resolveTypeWithBindings(
        typeNode.value,
        structTypes,
        keyResult.bindings,
      );
      return {
        type: Type.mapping(keyResult.type, valueResult.type),
        bindings: valueResult.bindings,
      };
    }
    return {
      type: Type.failure(`Unsupported complex type: ${typeNode.kind}`),
      bindings,
    };
  }

  if (Ast.Type.isReference(typeNode)) {
    const structType = structTypes.get(typeNode.name);
    if (!structType) {
      throw new TypeError(
        ErrorMessages.UNDEFINED_TYPE(typeNode.name),
        typeNode.loc || undefined,
        undefined,
        undefined,
        ErrorCode.UNDEFINED_TYPE,
      );
    }
    // Record the binding from this type reference to the struct declaration
    const updatedBindings = recordBinding(
      bindings,
      typeNode.id,
      structType.node,
    );
    return { type: structType.type, bindings: updatedBindings };
  }

  return { type: Type.failure("Unknown type"), bindings };
}

/**
 * Resolves an AST type node to a Type object (legacy version without bindings)
 */
export function resolveType(
  typeNode: Ast.Type,
  structTypes: Map<string, Declaration.Struct>,
): Type {
  if (Ast.Type.isElementary(typeNode)) {
    // Map elementary types based on kind and bits
    if (Ast.Type.Elementary.isUint(typeNode)) {
      const typeMap: Record<number, Type> = {
        256: Type.Elementary.uint(256),
        128: Type.Elementary.uint(128),
        64: Type.Elementary.uint(64),
        32: Type.Elementary.uint(32),
        16: Type.Elementary.uint(16),
        8: Type.Elementary.uint(8),
      };
      return (
        typeMap[typeNode.bits || 256] ||
        Type.failure(`Unknown uint size: ${typeNode.bits}`)
      );
    }

    if (Ast.Type.Elementary.isInt(typeNode)) {
      const typeMap: Record<number, Type> = {
        256: Type.Elementary.int(256),
        128: Type.Elementary.int(128),
        64: Type.Elementary.int(64),
        32: Type.Elementary.int(32),
        16: Type.Elementary.int(16),
        8: Type.Elementary.int(8),
      };
      return (
        typeMap[typeNode.bits || 256] ||
        Type.failure(`Unknown int size: ${typeNode.bits}`)
      );
    }

    if (Ast.Type.Elementary.isBytes(typeNode)) {
      if (!typeNode.size) {
        return Type.Elementary.bytes(); // Dynamic bytes
      }
      // typeNode.bits now contains the byte size directly (e.g., 32 for bytes32)
      const validSizes = [4, 8, 16, 32];
      if (validSizes.includes(typeNode.size)) {
        return Type.Elementary.bytes(typeNode.size);
      } else {
        return Type.failure(`Unknown bytes size: ${typeNode.size}`);
      }
    }
    if (Ast.Type.Elementary.isAddress(typeNode)) {
      return Type.Elementary.address();
    }
    if (Ast.Type.Elementary.isBool(typeNode)) {
      return Type.Elementary.bool();
    }
    if (Ast.Type.Elementary.isString(typeNode)) {
      return Type.Elementary.string();
    }
    return Type.failure(`Unknown elementary type: ${typeNode.kind}`);
  }

  if (Ast.Type.isComplex(typeNode)) {
    if (Ast.Type.Complex.isArray(typeNode)) {
      const elementType = resolveType(typeNode.element, structTypes);
      return Type.array(elementType, typeNode.size);
    }
    if (Ast.Type.Complex.isMapping(typeNode)) {
      const keyType = resolveType(typeNode.key, structTypes);
      const valueType = resolveType(typeNode.value, structTypes);
      return Type.mapping(keyType, valueType);
    }
    return Type.failure(`Unsupported complex type: ${typeNode.kind}`);
  }

  if (Ast.Type.isReference(typeNode)) {
    const structType = structTypes.get(typeNode.name);
    if (!structType) {
      throw new TypeError(
        ErrorMessages.UNDEFINED_TYPE(typeNode.name),
        typeNode.loc || undefined,
        undefined,
        undefined,
        ErrorCode.UNDEFINED_TYPE,
      );
    }
    return structType.type;
  }

  return Type.failure("Unknown type");
}
