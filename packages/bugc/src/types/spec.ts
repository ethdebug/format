/**
 * Type definitions for the BUG language
 */
import type * as Ast from "#ast";

export type Types = Map<Ast.Id, Type>;

export type Type =
  | Type.Elementary
  | Type.Array
  | Type.Struct
  | Type.Mapping
  | Type.Function
  | Type.Failure;

export const isType = (type: unknown): type is Type =>
  Type.isBase(type) &&
  [
    Type.isElementary,
    Type.isArray,
    Type.isStruct,
    Type.isMapping,
    Type.isFunction,
    Type.isFailure,
  ].some((guard) => guard(type));

const Array_ = Array;

export namespace Type {
  export interface Base {
    kind: string;
  }

  export const equals = (a: Type, b: Type): boolean => {
    if (a.kind !== b.kind) {
      return false;
    }

    if (Type.isElementary(a) && Type.isElementary(b)) {
      return Type.Elementary.equals(a, b);
    }

    const map = {
      array: Type.Array.equals,
      struct: Type.Struct.equals,
      mapping: Type.Mapping.equals,
      function: Type.Function.equals,
      failure: Type.Failure.equals,
    } as const;

    // @ts-expect-error typing this is too tricky
    return map[a.kind](a, b);
  };

  export const format = (type: Type): string => {
    if (Type.isElementary(type)) {
      return Type.Elementary.format(type);
    }

    const map = {
      array: Type.Array,
      struct: Type.Struct,
      mapping: Type.Mapping,
      function: Type.Function,
      failure: Type.Failure,
    } as const;

    // @ts-expect-error typing this is too tricky
    return map[type.kind].format(type);
  };

  export const isBase = (type: unknown): type is Type.Base =>
    typeof type === "object" &&
    !!type &&
    "kind" in type &&
    typeof type.kind === "string" &&
    !!type.kind;

  export type Elementary =
    | Type.Elementary.Uint
    | Type.Elementary.Int
    | Type.Elementary.Address
    | Type.Elementary.Bool
    | Type.Elementary.Bytes
    | Type.Elementary.String;

  export const isElementary = (type: Type.Base): type is Type.Elementary =>
    [
      Type.Elementary.isUint,
      Type.Elementary.isInt,
      Type.Elementary.isAddress,
      Type.Elementary.isBool,
      Type.Elementary.isBytes,
      Type.Elementary.isString,
    ].some((guard) => guard(type));

  export namespace Elementary {
    export const equals = (a: Type.Elementary, b: Type.Elementary): boolean => {
      if (a.kind !== b.kind) {
        return false;
      }

      const map = {
        uint: Type.Elementary.Uint.equals,
        int: Type.Elementary.Int.equals,
        address: Type.Elementary.Address.equals,
        bytes: Type.Elementary.Bytes.equals,
        bool: Type.Elementary.Bool.equals,
        string: Type.Elementary.String.equals,
      } as const;

      // @ts-expect-error typing this is too tricky
      return map[a.kind](a, b);
    };

    export const format = <T extends Type.Elementary>(type: T): string => {
      const map = {
        uint: Type.Elementary.Uint,
        int: Type.Elementary.Int,
        address: Type.Elementary.Address,
        bytes: Type.Elementary.Bytes,
        bool: Type.Elementary.Bool,
        string: Type.Elementary.String,
      } as const;

      // @ts-expect-error typing this is needlessly tricky
      return map[type.kind].format(type);
    };

    export interface Uint {
      kind: "uint";
      bits: number;
    }

    export const uint = (bits: number): Type.Elementary.Uint => ({
      kind: "uint",
      bits,
    });

    export namespace Uint {
      export const equals = (
        a: Type.Elementary.Uint,
        b: Type.Elementary.Uint,
      ): boolean => a.bits === b.bits;

      export const format = (type: Type.Elementary.Uint): string =>
        `uint${type.bits}`;
    }

    export interface Int {
      kind: "int";
      bits: number;
    }

    export const int = (bits: number): Type.Elementary.Int => ({
      kind: "int",
      bits,
    });

    export namespace Int {
      export const equals = (
        a: Type.Elementary.Int,
        b: Type.Elementary.Int,
      ): boolean => a.bits === b.bits;

      export const format = (type: Type.Elementary.Int): string =>
        `int${type.bits}`;
    }

    export interface Address {
      kind: "address";
    }

    export const address = (): Type.Elementary.Address => ({
      kind: "address",
    });

    export namespace Address {
      export const equals = (
        _a: Type.Elementary.Address,
        _b: Type.Elementary.Address,
      ): boolean => true;

      export const format = (_type: Type.Elementary.Address): string =>
        `address`;
    }

    export interface Bool {
      kind: "bool";
    }

    export const bool = (): Type.Elementary.Bool => ({
      kind: "bool",
    });

    export namespace Bool {
      export const equals = (
        _a: Type.Elementary.Bool,
        _b: Type.Elementary.Bool,
      ): boolean => true;

      export const format = (_type: Type.Elementary.Bool): string => `bool`;
    }

    export interface Bytes {
      kind: "bytes";
      size?: number;
    }

    export const bytes = (size?: number): Type.Elementary.Bytes => ({
      kind: "bytes",
      size,
    });

    export namespace Bytes {
      export const isDynamic = (
        type: Type.Elementary.Bytes,
      ): type is Type.Elementary.Bytes & { size?: undefined } =>
        !("size" in type) || type.size === undefined;

      export const equals = (
        a: Type.Elementary.Bytes,
        b: Type.Elementary.Bytes,
      ): boolean => a.size == b.size;

      export const format = (type: Type.Elementary.Bytes) =>
        `bytes${
          "size" in type && typeof type.size === "number"
            ? type.size.toString()
            : ""
        }`;
    }

    export interface String {
      kind: "string";
    }

    export const string = (): Type.Elementary.String => ({
      kind: "string",
    });

    export namespace String {
      export const equals = (
        _a: Type.Elementary.String,
        _b: Type.Elementary.String,
      ): boolean => true;

      export const format = (_type: Type.Elementary.String): string => `string`;
    }

    const makeIsKind =
      <K extends string>(kind: K) =>
      (type: Type.Base): type is Type.Base & { kind: K } =>
        type.kind === kind;

    export const isUint = makeIsKind("uint" as const);
    export const isInt = makeIsKind("int" as const);
    export const isAddress = makeIsKind("address" as const);
    export const isBool = makeIsKind("bool" as const);
    export const isBytes = makeIsKind("bytes" as const);
    export const isString = makeIsKind("string" as const);

    export const isNumeric = (type: Type.Elementary) =>
      Type.Elementary.isUint(type) || Type.Elementary.isInt(type);
  }

  export interface Array {
    kind: "array";
    element: Type;
    size?: number;
  }

  export const isArray = (type: Type.Base): type is Type.Array =>
    type.kind === "array" && "element" in type && isType(type.element);

  export const array = (element: Type, size?: number): Type.Array => ({
    kind: "array",
    element,
    size,
  });

  export namespace Array {
    export const equals = (a: Type.Array, b: Type.Array): boolean =>
      Type.equals(a.element, b.element) && a.size === b.size;

    export const format = (type: Type.Array): string =>
      `array<${Type.format(type.element)}${
        "size" in type && typeof type.size === "number" ? `, ${type.size}` : ""
      }>`;
  }

  export interface Mapping {
    kind: "mapping";
    key: Type;
    value: Type;
  }

  export const mapping = (key: Type, value: Type): Type.Mapping => ({
    kind: "mapping",
    key,
    value,
  });

  export const isMapping = (type: Type.Base): type is Type.Mapping =>
    type.kind === "mapping" &&
    "key" in type &&
    "value" in type &&
    isType(type.key) &&
    isType(type.value);

  export namespace Mapping {
    export const equals = (a: Type.Mapping, b: Type.Mapping): boolean =>
      Type.equals(a.key, b.key) && Type.equals(a.value, b.value);

    export const format = (type: Type.Mapping): string =>
      `mapping<${Type.format(type.key)}, ${Type.format(type.value)}>`;
  }

  export interface FieldLayout {
    byteOffset: number; // Byte offset from struct start
    size: number; // Size in bytes
  }

  export interface Struct {
    kind: "struct";
    name: string;
    fields: Map<string, Type>;
    layout: Map<string, FieldLayout>;
  }

  export const isStruct = (type: Type.Base): type is Type.Struct =>
    type.kind === "struct" &&
    "name" in type &&
    typeof type.name === "string" &&
    "fields" in type &&
    type.fields instanceof Map &&
    [...type.fields.values()].every(isType);

  export const struct = (
    name: string,
    fields: Map<string, Type>,
    layout: Map<string, FieldLayout>,
  ): Type.Struct => ({
    kind: "struct",
    name,
    fields,
    layout,
  });

  export namespace Struct {
    export const equals = (a: Type.Struct, b: Type.Struct): boolean =>
      a.name === b.name &&
      a.fields.size == b.fields.size &&
      [...a.fields.entries()].every(
        ([keyA, valueA], index) =>
          [...b.fields.keys()][index] === keyA &&
          [...b.fields.values()][index] === valueA,
      );

    export const format = (type: Type.Struct): string => type.name;
  }

  export interface Function {
    kind: "function";
    name?: string;
    parameters: Type[];
    return: Type | null; // null for void functions
  }

  export const function_ = (
    parameters: Type[],
    return_: Type | null,
    name?: string,
  ): Type.Function => ({
    kind: "function",
    parameters,
    return: return_,
    name,
  });

  export const isFunction = (type: Type.Base): type is Type.Function =>
    type.kind === "function" &&
    "parameters" in type &&
    type.parameters instanceof Array_ &&
    type.parameters.every(isType) &&
    "return" in type &&
    (type.return === null || isType(type.return));

  export namespace Function {
    export const equals = (a: Type.Function, b: Type.Function): boolean =>
      a.parameters.length === b.parameters.length &&
      a.parameters.every((type, index) => type == b.parameters[index]) &&
      ((a.return === null && b.return === null) ||
        (a.return !== null &&
          b.return !== null &&
          Type.equals(a.return, b.return)));

    export const format = (type: Type.Function): string =>
      `function ${"name" in type ? type.name : ""}(${type.parameters
        .map((parameter) => Type.format(parameter))
        .join(", ")})${
        type.return !== null ? `-> ${Type.format(type.return)}` : ""
      }`;
  }

  export interface Failure {
    kind: "fail";
    reason: string;
  }

  export const failure = (reason: string): Type.Failure => ({
    kind: "fail",
    reason,
  });

  export const isFailure = (type: Type.Base): type is Type.Failure =>
    type.kind === "fail" &&
    "reason" in type &&
    typeof type.reason === "string" &&
    !!type.reason;

  export namespace Failure {
    export const equals = (a: Type.Failure, b: Type.Failure): boolean =>
      a.reason === b.reason;

    export const format = (type: Type.Failure): string =>
      `fail<"${type.reason}">`;
  }
}

/**
 * Bindings map identifier AST nodes to their declaration sites.
 *
 * This is a flat, global mapping that records where each identifier
 * in the program was declared. Unlike the symbol table, this is not
 * scope-aware - it's just a simple lookup table.
 *
 * The keys are AST IDs of identifier nodes (where symbols are used).
 * The values are declaration nodes (where symbols are declared).
 */
export type Bindings = Map<Ast.Id, Ast.Declaration>;

/**
 * Create an empty bindings map
 */
export function emptyBindings(): Bindings {
  return new Map();
}

/**
 * Record a binding from an identifier use to its declaration
 */
export function recordBinding(
  bindings: Bindings,
  identifierId: Ast.Id,
  declaration: Ast.Declaration,
): Bindings {
  const updated = new Map(bindings);
  updated.set(identifierId, declaration);
  return updated;
}

/**
 * Merge multiple bindings maps
 */
export function mergeBindings(...bindingMaps: Bindings[]): Bindings {
  const merged = new Map<Ast.Id, Ast.Declaration>();
  for (const bindings of bindingMaps) {
    for (const [id, decl] of bindings) {
      merged.set(id, decl);
    }
  }
  return merged;
}
