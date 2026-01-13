import { Data } from "../data";
import { Materials } from "../materials";

import * as _Base from "./base";

export type Type = Type.Known | Type.Unknown;

export const isType = (value: unknown): value is Type =>
  Type.hasElementaryKind(value) || Type.hasComplexKind(value)
    ? Type.isKnown(value)
    : Type.isUnknown(value);

export namespace Type {
  export import Base = _Base;

  export type Known = Elementary | Complex;

  export const isKnown = (value: unknown): value is Known =>
    [isElementary, isComplex].some((guard) => guard(value));

  export type Unknown = Base.Type & {
    class: Exclude<Base.Type["class"], undefined>;
  };

  export const isUnknown = (value: unknown): value is Unknown =>
    Base.isType(value) &&
    "class" in value &&
    (!("contains" in value) ||
      Type.isWrapper(value.contains) ||
      (value.contains instanceof Array &&
        value.contains.every(Type.isWrapper)) ||
      (typeof value.contains === "object" &&
        Object.values(value.contains).every(Type.isWrapper)));

  export interface Wrapper {
    type: Type | { id: any };
  }

  export const isWrapper = (value: unknown): value is Wrapper =>
    typeof value === "object" &&
    !!value &&
    "type" in value &&
    (isType(value.type) ||
      (typeof value.type === "object" && !!value.type && "id" in value.type));

  export type Elementary =
    | Elementary.Uint
    | Elementary.Int
    | Elementary.Ufixed
    | Elementary.Fixed
    | Elementary.Bool
    | Elementary.Bytes
    | Elementary.String
    | Elementary.Address
    | Elementary.Contract
    | Elementary.Enum;

  export const hasElementaryKind = (
    value: unknown,
  ): value is {
    kind: Elementary["kind"];
  } =>
    typeof value === "object" &&
    !!value &&
    "kind" in value &&
    typeof value.kind === "string" &&
    [
      "uint",
      "int",
      "ufixed",
      "fixed",
      "bool",
      "bytes",
      "string",
      "address",
      "contract",
      "enum",
    ].includes(value.kind);

  export const isElementary = (value: unknown): value is Elementary =>
    [
      Elementary.isUint,
      Elementary.isInt,
      Elementary.isUfixed,
      Elementary.isFixed,
      Elementary.isBool,
      Elementary.isBytes,
      Elementary.isString,
      Elementary.isAddress,
      Elementary.isContract,
      Elementary.isEnum,
    ].some((guard) => guard(value));

  export namespace Elementary {
    export interface Uint {
      class?: "elementary";
      kind: "uint";
      bits: number;
    }

    export const isUint = (value: unknown): value is Uint =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "uint") &&
      "bits" in value &&
      typeof value.bits === "number" &&
      value.bits >= 8 &&
      value.bits <= 256 &&
      value.bits % 8 === 0;

    export interface Int {
      class?: "elementary";
      kind: "int";
      bits: number;
    }

    export const isInt = (value: unknown): value is Int =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "int") &&
      "bits" in value &&
      typeof value.bits === "number" &&
      value.bits >= 8 &&
      value.bits <= 256 &&
      value.bits % 8 === 0;

    export interface Ufixed {
      class?: "elementary";
      kind: "ufixed";
      bits: number;
      places: number;
    }

    export const isUfixed = (value: unknown): value is Ufixed =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "ufixed") &&
      "bits" in value &&
      typeof value.bits === "number" &&
      value.bits >= 8 &&
      value.bits <= 256 &&
      value.bits % 8 === 0 &&
      "places" in value &&
      typeof value.places === "number" &&
      value.places >= 1 &&
      value.places <= 80;

    export interface Fixed {
      class?: "elementary";
      kind: "fixed";
      bits: number;
      places: number;
    }

    export const isFixed = (value: unknown): value is Fixed =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "fixed") &&
      "bits" in value &&
      typeof value.bits === "number" &&
      value.bits >= 8 &&
      value.bits <= 256 &&
      value.bits % 8 === 0 &&
      "places" in value &&
      typeof value.places === "number" &&
      value.places >= 1 &&
      value.places <= 80;

    export interface Bool {
      class?: "elementary";
      kind: "bool";
    }

    export const isBool = (value: unknown): value is Bool =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "bool");

    export interface Bytes {
      class?: "elementary";
      kind: "bytes";
      size?: Data.Unsigned;
    }

    export const isBytes = (value: unknown): value is Bytes =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "bytes") &&
      (!("size" in value) || Data.isUnsigned(value.size));

    export interface String {
      class?: "elementary";
      kind: "string";
      encoding?: string;
    }

    export const isString = (value: unknown): value is String =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "string") &&
      (!("encoding" in value) || typeof value.encoding === "string");

    export interface Address {
      class?: "elementary";
      kind: "address";
      payable?: boolean;
    }

    export const isAddress = (value: unknown): value is Address =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "address") &&
      (!("payable" in value) || typeof value.payable === "boolean");

    export interface Contract {
      class?: "elementary";
      kind: "contract";
      payable?: boolean;
      definition?: Definition;
    }

    export const isContract = (value: unknown): value is Contract =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "contract") &&
      (!("payable" in value) || typeof value.payable === "boolean") &&
      (!("definition" in value) || isDefinition(value.definition));

    export interface Enum {
      class?: "elementary";
      kind: "enum";
      values: any[];
      definition?: Definition;
    }

    export const isEnum = (value: unknown): value is Enum =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      hasKind(value, "enum") &&
      "values" in value &&
      value.values instanceof Array &&
      (!("definition" in value) || isDefinition(value.definition));
  }

  export type Complex =
    | Complex.Alias
    | Complex.Tuple
    | Complex.Array
    | Complex.Mapping
    | Complex.Struct;
  /* currently unsupported: | Complex.Function */

  export const hasComplexKind = (
    value: unknown,
  ): value is {
    kind: Complex["kind"];
  } =>
    typeof value === "object" &&
    !!value &&
    "kind" in value &&
    typeof value.kind === "string" &&
    [
      "alias",
      "tuple",
      "array",
      "mapping",
      "struct",
      // "function"
    ].includes(value.kind);

  export const isComplex = (value: unknown): value is Complex =>
    [
      Complex.isAlias,
      Complex.isTuple,
      Complex.isArray,
      Complex.isMapping,
      Complex.isStruct,
    ].some((guard) => guard(value));

  export namespace Complex {
    export interface Alias {
      class?: "complex";
      kind: "alias";
      contains: Wrapper;
      definition?: Definition;
    }

    export const isAlias = (value: unknown): value is Alias =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      hasKind(value, "alias") &&
      "contains" in value &&
      isWrapper(value.contains) &&
      (!("definition" in value) || isDefinition(value.definition));

    export interface Tuple {
      class?: "complex";
      kind: "tuple";
      contains: (Wrapper & { name?: string })[];
    }

    export const isTuple = (value: unknown): value is Tuple =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      hasKind(value, "tuple") &&
      "contains" in value &&
      value.contains instanceof Array &&
      value.contains.every(
        (element) =>
          isWrapper(element) &&
          (!("name" in element) || typeof element.name === "string"),
      );

    export interface Array {
      class?: "complex";
      kind: "array";
      contains: Wrapper;
    }

    export const isArray = (value: unknown): value is Array =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      hasKind(value, "array") &&
      "contains" in value &&
      isWrapper(value.contains);

    export interface Mapping {
      class?: "complex";
      kind: "mapping";
      contains: {
        key: Wrapper;
        value: Wrapper;
      };
    }

    export const isMapping = (value: unknown): value is Mapping =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      hasKind(value, "mapping") &&
      "contains" in value &&
      typeof value.contains === "object" &&
      !!value.contains &&
      "key" in value.contains &&
      isWrapper(value.contains.key) &&
      "value" in value.contains &&
      isWrapper(value.contains.value);

    export interface Struct {
      class?: "complex";
      kind: "struct";
      contains: (Wrapper & { name?: string })[];
      definition?: Definition;
    }

    export const isStruct = (value: unknown): value is Struct =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      hasKind(value, "struct") &&
      "contains" in value &&
      value.contains instanceof Array &&
      value.contains.every(
        (field) =>
          isWrapper(field) &&
          (!("name" in field) || typeof field.name === "string"),
      ) &&
      (!("definition" in value) || isDefinition(value.definition));
  }

  export interface Definition {
    name?: string;
    location?: Materials.SourceRange;
  }

  export const isDefinition = (value: unknown): value is Definition =>
    typeof value === "object" &&
    !!value &&
    (!("name" in value) || typeof value.name === "string") &&
    (!("location" in value) || Materials.isSourceRange(value.location)) &&
    (Object.keys(value).includes("name") ||
      Object.keys(value).includes("location"));
}

export const mayHaveClass = <Class extends string>(
  object: object,
  class_: Class,
): object is { class: Class } =>
  !("class" in object) || object.class === class_;

export const hasKind = <Kind extends string>(
  object: object,
  kind: Kind,
): object is { kind: Kind } => "kind" in object && object.kind === kind;
