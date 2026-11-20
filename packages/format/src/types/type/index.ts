import { Materials } from "#types/materials";

import * as _Base from "./base.js";

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
      (Array.isArray(value.contains) && value.contains.every(Type.isWrapper)) ||
      (typeof value.contains === "object" &&
        Object.values(value.contains).every(Type.isWrapper)));

  export interface Reference {
    id: string | number;
  }

  export const isReference = (value: unknown): value is Reference =>
    typeof value === "object" &&
    !!value &&
    "id" in value &&
    (typeof value.id === "string" || typeof value.id === "number");

  export type Specifier = Type | Reference;

  export const isSpecifier = (value: unknown): value is Specifier =>
    isType(value) || isReference(value);

  export interface Wrapper {
    type: Specifier;
  }

  export const isWrapper = (value: unknown): value is Wrapper =>
    typeof value === "object" &&
    !!value &&
    "type" in value &&
    isSpecifier(value.type);

  export type Elementary =
    | Elementary.Number
    | Elementary.Address
    | Elementary.Bool
    | Elementary.Enum
    | Elementary.Flags
    | Elementary.Bytes
    | Elementary.String;

  export const hasElementaryKind = (
    value: unknown,
  ): value is {
    kind: Elementary["kind"];
  } =>
    typeof value === "object" &&
    !!value &&
    "kind" in value &&
    typeof value.kind === "string" &&
    ["number", "address", "bool", "enum", "flags", "bytes", "string"].includes(
      value.kind,
    );

  export const isElementary = (value: unknown): value is Elementary =>
    [
      Elementary.isNumber,
      Elementary.isAddress,
      Elementary.isBool,
      Elementary.isEnum,
      Elementary.isFlags,
      Elementary.isBytes,
      Elementary.isString,
    ].some((guard) => guard(value));

  export namespace Elementary {
    export interface Number {
      class?: "elementary";
      kind: "number";
      label?: string;
      signed?: boolean;
      places?: number;
    }

    export const isNumber = (value: unknown): value is Number =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "number") &&
      (!("signed" in value) || typeof value.signed === "boolean") &&
      (!("places" in value) ||
        (typeof value.places === "number" &&
          globalThis.Number.isInteger(value.places) &&
          value.places >= 0));

    export namespace Address {
      export type Definition = Type.Definition & {
        library?: boolean;
        interface?: boolean;
      };

      export const isDefinition = (value: unknown): value is Definition =>
        Type.isDefinition(value) &&
        (!("library" in value) || typeof value.library === "boolean") &&
        (!("interface" in value) || typeof value.interface === "boolean") &&
        // the schema's oneOf rejects a type that is both
        !(
          "library" in value &&
          value.library === true &&
          "interface" in value &&
          value.interface === true
        );
    }

    export interface Address {
      class?: "elementary";
      kind: "address";
      label?: string;
      payable?: boolean;
      definition?: Address.Definition;
    }

    export const isAddress = (value: unknown): value is Address =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "address") &&
      (!("payable" in value) || typeof value.payable === "boolean") &&
      (!("definition" in value) || Address.isDefinition(value.definition));

    export interface Bool {
      class?: "elementary";
      kind: "bool";
      label?: string;
    }

    export const isBool = (value: unknown): value is Bool =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "bool");

    const isNames = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.length >= 1 &&
      value.every((name) => typeof name === "string") &&
      new Set(value).size === value.length;

    export interface Enum {
      class?: "elementary";
      kind: "enum";
      label?: string;
      values: string[];
      definition?: Definition;
    }

    export const isEnum = (value: unknown): value is Enum =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "enum") &&
      "values" in value &&
      isNames(value.values) &&
      (!("definition" in value) || isDefinition(value.definition));

    export interface Flags {
      class?: "elementary";
      kind: "flags";
      label?: string;
      values: string[];
      definition?: Definition;
    }

    export const isFlags = (value: unknown): value is Flags =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "flags") &&
      "values" in value &&
      isNames(value.values) &&
      (!("definition" in value) || isDefinition(value.definition));

    export interface Bytes {
      class?: "elementary";
      kind: "bytes";
      label?: string;
    }

    export const isBytes = (value: unknown): value is Bytes =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "bytes");

    export interface String {
      class?: "elementary";
      kind: "string";
      label?: string;
      encoding?: string;
    }

    export const isString = (value: unknown): value is String =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "elementary") &&
      mayHaveLabel(value) &&
      hasKind(value, "string") &&
      (!("encoding" in value) || typeof value.encoding === "string");
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
      label?: string;
      contains: Wrapper;
      definition?: Definition;
    }

    export const isAlias = (value: unknown): value is Alias =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      mayHaveLabel(value) &&
      hasKind(value, "alias") &&
      "contains" in value &&
      isWrapper(value.contains) &&
      (!("definition" in value) || isDefinition(value.definition));

    export interface Tuple {
      class?: "complex";
      kind: "tuple";
      label?: string;
      contains: (Wrapper & { name?: string })[];
    }

    export const isTuple = (value: unknown): value is Tuple =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      mayHaveLabel(value) &&
      hasKind(value, "tuple") &&
      "contains" in value &&
      Array.isArray(value.contains) &&
      value.contains.every(
        (element) =>
          isWrapper(element) &&
          (!("name" in element) || typeof element.name === "string"),
      );

    export interface Array {
      class?: "complex";
      kind: "array";
      label?: string;
      contains: Wrapper;
    }

    export const isArray = (value: unknown): value is Array =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      mayHaveLabel(value) &&
      hasKind(value, "array") &&
      "contains" in value &&
      isWrapper(value.contains);

    export interface Mapping {
      class?: "complex";
      kind: "mapping";
      label?: string;
      contains: {
        key: Wrapper;
        value: Wrapper;
      };
    }

    export const isMapping = (value: unknown): value is Mapping =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      mayHaveLabel(value) &&
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
      label?: string;
      contains: (Wrapper & { name?: string })[];
      definition?: Definition;
    }

    export const isStruct = (value: unknown): value is Struct =>
      typeof value === "object" &&
      !!value &&
      mayHaveClass(value, "complex") &&
      mayHaveLabel(value) &&
      hasKind(value, "struct") &&
      "contains" in value &&
      Array.isArray(value.contains) &&
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

export const mayHaveLabel = (object: object): boolean =>
  !("label" in object) || typeof object.label === "string";

export const hasKind = <Kind extends string>(
  object: object,
  kind: Kind,
): object is { kind: Kind } => "kind" in object && object.kind === kind;
