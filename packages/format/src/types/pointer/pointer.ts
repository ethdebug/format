export type Pointer =
  | Pointer.Region
  | Pointer.Collection;

export const isPointer = (value: unknown): value is Pointer =>
  [
    Pointer.isRegion,
    Pointer.isCollection
  ].some(guard => guard(value));

export namespace Pointer {
  export type Identifier = string;
  export const isIdentifier = (value: unknown): value is Identifier =>
    typeof value === "string" && /^[a-zA-Z_\\-]+[a-zA-Z0-9$_\\-]*$/.test(value);

  export type Region =
    | Region.Stack
    | Region.Memory
    | Region.Storage
    | Region.Calldata
    | Region.Returndata
    | Region.Transient
    | Region.Code;

  export const isRegion = (value: unknown): value is Region =>
    [
      Region.isStack,
      Region.isMemory,
      Region.isStorage,
      Region.isCalldata,
      Region.isReturndata,
      Region.isTransient,
      Region.isCode
    ].some(guard => guard(value));

  export namespace Region {
    export interface Base {
      name?: string;
      location: string;
    }
    export const isBase = (value: unknown): value is Base =>
      !!value &&
        typeof value === "object" &&
        (!("name" in value) || typeof value.name === "string") &&
        "location" in value &&
        typeof value.location === "string";

    export type Name = Base["name"];

    export type Stack =
      & Base
      & Scheme.Segment
      & { location: "stack" };
    export const isStack = (value: unknown): value is Stack =>
      isBase(value) && Scheme.isSegment(value) && value.location === "stack";

    export type Memory =
      & Base
      & Scheme.Slice
      & { location: "memory" };
    export const isMemory = (value: unknown): value is Memory =>
      isBase(value) && Scheme.isSlice(value) && value.location === "memory";

    export type Storage =
      & Base
      & Scheme.Segment
      & { location: "storage" };
    export const isStorage = (value: unknown): value is Storage =>
      isBase(value) && Scheme.isSegment(value) && value.location === "storage";

    export type Calldata =
      & Base
      & Scheme.Slice
      & { location: "calldata" };
    export const isCalldata = (value: unknown): value is Calldata =>
      isBase(value) && Scheme.isSlice(value) && value.location === "calldata";

    export type Returndata =
      & Base
      & Scheme.Slice
      & { location: "returndata" };
    export const isReturndata = (value: unknown): value is Returndata =>
      isBase(value) && Scheme.isSlice(value) && value.location === "returndata";

    export type Transient =
      & Base
      & Scheme.Segment
      & { location: "transient" };
    export const isTransient = (value: unknown): value is Transient =>
      isBase(value) && Scheme.isSegment(value) && value.location === "transient";

    export type Code =
      & Base
      & Scheme.Slice
      & { location: "code" };
    export const isCode = (value: unknown): value is Code =>
      isBase(value) && Scheme.isSlice(value) && value.location === "code";
  }

  export namespace Scheme {
    export interface Segment {
      slot: Expression;
      offset?: Expression;
      length?: Expression;
    }
    export const isSegment = (value: unknown): value is Segment =>
      !!value &&
        typeof value === "object" &&
        "slot" in value &&
        isExpression(value.slot) &&
        (!("offset" in value) || isExpression(value.offset)) &&
        (!("length" in value) || isExpression(value.length));

    export interface Slice {
      offset: Expression;
      length: Expression;
    }

    export const isSlice = (value: unknown): value is Slice =>
      !!value &&
        typeof value === "object" &&
        "offset" in value &&
        isExpression(value.offset) &&
        "length" in value &&
        isExpression(value.length);
  }

  export type Collection =
    | Collection.Group
    | Collection.List
    | Collection.Conditional
    | Collection.Scope
    | Collection.Reference;

  export const isCollection = (value: unknown): value is Collection =>
    [
      Collection.isGroup,
      Collection.isList,
      Collection.isConditional,
      Collection.isScope,
      Collection.isReference
    ].some(guard => guard(value));

  export namespace Collection {
    export interface Group {
      group: Pointer[];
    }
    export const isGroup = (value: unknown): value is Group =>
      !!value &&
        typeof value === "object" &&
        Object.keys(value).length === 1 &&
        "group" in value &&
        value.group instanceof Array &&
        value.group.length >= 1 &&
        value.group.every(isPointer);

    export interface List {
      list: {
        count: Expression;
        each: Identifier;
        is: Pointer;
      }
    }
    export const isList = (value: unknown): value is List =>
      !!value &&
        typeof value === "object" &&
        Object.keys(value).length === 1 &&
        "list" in value &&
        !!value.list &&
        typeof value.list === "object" &&
        Object.keys(value.list).length === 3 &&
        "count" in value.list &&
        isExpression(value.list.count) &&
        "each" in value.list &&
        isIdentifier(value.list.each) &&
        "is" in value.list &&
        isPointer(value.list.is);

    export interface Conditional {
      if: Expression;
      then: Pointer;
      else?: Pointer;
    }
    export const isConditional = (value: unknown): value is Conditional =>
      !!value &&
        typeof value === "object" &&
        "if" in value &&
        isExpression(value.if) &&
        "then" in value &&
        isPointer(value.then) &&
        (!("else" in value) || isPointer(value.else));

    export interface Scope {
      define: {
        [identifier: string]: Expression;
      }
      in: Pointer;
    }

    export const isScope = (value: unknown): value is Scope =>
      !!value &&
        typeof value === "object" &&
        "define" in value &&
        typeof value.define === "object" && !!value.define &&
        Object.keys(value.define).every(key => isIdentifier(key)) &&
        "in" in value &&
        isPointer(value.in);

    export interface Reference {
      template: string;
      yields?: Record<string, string>;
    }

    export const isReference = (value: unknown): value is Reference =>
      !!value &&
        typeof value === "object" &&
        "template" in value &&
        typeof value.template === "string" && !!value.template &&
        (!("yields" in value) || (
          typeof value.yields === "object" &&
          value.yields !== null &&
          Object.entries(value.yields as Record<string, unknown>).every(
            ([k, v]) => isIdentifier(k) && isIdentifier(v)
          )
        ))
  }

  export type Expression =
    | Expression.Literal
    | Expression.Constant
    | Expression.Variable
    | Expression.Arithmetic
    | Expression.Lookup
    | Expression.Read
    | Expression.Keccak256
    | Expression.Concat
    | Expression.Resize;

  export const isExpression = (value: unknown): value is Expression =>
    [
      Expression.isLiteral,
      Expression.isConstant,
      Expression.isVariable,
      Expression.isArithmetic,
      Expression.isLookup,
      Expression.isRead,
      Expression.isKeccak256,
      Expression.isConcat,
      Expression.isResize
    ].some(guard => guard(value));

  export namespace Expression {
    export type Literal = number | `0x${string}`;
    export const isLiteral = (value: unknown): value is Literal =>
      typeof value === "number" ||
        typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);

    export type Constant =
      | "$wordsize";
    export const isConstant = (value: unknown): value is Constant =>
      typeof value === "string" && ["$wordsize"].includes(value);

    export type Variable = string;
    export const isVariable = (value: unknown): value is Variable =>
      isIdentifier(value);

    export type Arithmetic =
      | Arithmetic.Sum
      | Arithmetic.Difference
      | Arithmetic.Product
      | Arithmetic.Quotient
      | Arithmetic.Remainder;

    export const isArithmetic = (value: unknown): value is Arithmetic =>
      [
        Arithmetic.isSum,
        Arithmetic.isDifference,
        Arithmetic.isProduct,
        Arithmetic.isQuotient,
        Arithmetic.isRemainder
      ].some(guard => guard(value));

    const makeIsOperation = <
      O extends string,
      T extends { [K in O]: any; }
    >(
      operation: O,
      checkOperands: (operands: unknown) => operands is T[O]
    ) => (value: unknown): value is T =>
      !!value &&
        typeof value === "object" &&
        Object.keys(value).length === 1 &&
        operation in value &&
        checkOperands(value[operation as keyof typeof value]);

    export type Operands = Expression[];
    export const isOperands =
      (value: unknown): value is Expression[] =>
        value instanceof Array && value.every(isExpression);

    export namespace Arithmetic {
      export type Operation =
        | keyof Sum
        | keyof Difference
        | keyof Product
        | keyof Quotient
        | keyof Remainder;

      export const isTwoOperands =
        (value: unknown): value is [Expression, Expression] =>
          isOperands(value) && value.length === 2;

      export interface Sum {
        $sum: Expression[];
      }
      export const isSum =
        makeIsOperation<"$sum", Sum>("$sum", isOperands);

      export interface Difference {
        $difference: [Expression, Expression];
      }
      export const isDifference =
        makeIsOperation<"$difference", Difference>("$difference", isTwoOperands);

      export interface Product {
        $product: Expression[];
      }
      export const isProduct =
        makeIsOperation<"$product", Product>("$product", isOperands);

      export interface Quotient {
        $quotient: [Expression, Expression];
      }
      export const isQuotient =
        makeIsOperation<"$quotient", Quotient>("$quotient", isTwoOperands);

      export interface Remainder {
        $remainder: [Expression, Expression];
      }
      export const isRemainder =
        makeIsOperation<"$remainder", Remainder>("$remainder", isTwoOperands);
    }

    export type Reference =
      | Identifier
      | "$this";
    export const isReference = (value: unknown): value is Reference =>
      isIdentifier(value) || value === "$this";

    export type Lookup =
      | Lookup.Offset
      | Lookup.Length
      | Lookup.Slot;
    export const isLookup = (value: unknown): value is Lookup =>
      [
        Lookup.isOffset,
        Lookup.isLength,
        Lookup.isSlot
      ].some(guard => guard(value));

    export namespace Lookup {
      export type Operation =
        | keyof Offset
        | keyof Length
        | keyof Slot;

      export type ForOperation<O extends Operation> =
        & Lookup
        & { [K in O]: any };

      export const propertyFrom = <O extends Operation>(
        operation: O
      ): "slot" | "offset" | "length" => {
        return operation.slice(1) as "slot" | "offset" | "length";
      }

      export interface Offset {
        ".offset": Reference;
      }
      export const isOffset =
        makeIsOperation<".offset", Offset>(".offset", isReference);

      export interface Length {
        ".length": Reference;
      }
      export const isLength =
        makeIsOperation<".length", Length>(".length", isReference);

      export interface Slot {
        ".slot": Reference;
      }
      export const isSlot =
        makeIsOperation<".slot", Slot>(".slot", isReference);
    }

    export interface Read {
      $read: Reference
    }
    export const isRead = makeIsOperation<"$read", Read>("$read", isReference);

    export interface Keccak256 {
      $keccak256: Expression[];
    }
    export const isKeccak256 =
      makeIsOperation<"$keccak256", Keccak256>("$keccak256", isOperands);

    export interface Concat {
      $concat: Expression[];
    }
    export const isConcat =
      makeIsOperation<"$concat", Concat>("$concat", isOperands);

    export type Resize<N extends number = number> =
      | Resize.ToNumber<N>
      | Resize.ToWordsize;
    export const isResize = <N extends number>(
      value: unknown
    ): value is Resize<N> =>
      [
        Resize.isToWordsize,
        Resize.isToNumber,
      ].some(guard => guard(value));

    export namespace Resize {
      export type ToNumber<N extends number> = {
        [K in `$sized${N}`]: Expression;
      };
      export const isToNumber = <N extends number>(
        value: unknown
      ): value is ToNumber<N> => {
        if (
          !value ||
            typeof value !== "object" ||
            Object.keys(value).length !== 1
        ) {
          return false;
        }
        const [key] = Object.keys(value);

        return typeof key === "string" && /^\$sized([1-9]+[0-9]*)$/.test(key);
      };

      export type ToWordsize = {
        $wordsized: Expression;
      }
      export const isToWordsize = (value: unknown): value is ToWordsize =>
        !!value &&
          typeof value === "object" &&
          Object.keys(value).length === 1 &&
          "$wordsized" in value &&
          typeof value.$wordsized !== "undefined" &&
          isExpression(value.$wordsized);
    }
  }

  export interface Templates {
    [identifier: string]: Pointer.Template;
  }

  export const isTemplates = (value: unknown): value is Templates =>
    !!value &&
      typeof value === "object" &&
      Object.keys(value).every(isIdentifier) &&
      Object.values(value).every(isTemplate);

  export interface Template {
    expect: string[];
    for: Pointer;
  }

  export const isTemplate = (value: unknown): value is Template =>
    !!value &&
      typeof value === "object" &&
      Object.keys(value).length === 2 &&
      "expect" in value &&
      value.expect instanceof Array &&
      value.expect.every(isIdentifier) &&
      "for" in value &&
      isPointer(value.for);

}
