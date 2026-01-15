/**
 * Normalized AST node types for the BUG language
 *
 * Aligned with ethdebug format domain language for compatibility
 * with debugging tooling and standardization.
 *
 * Key principles:
 * 1. Unified patterns for similar constructs (declarations, blocks, etc.)
 * 2. Use discriminated unions with 'kind' fields for variants
 * 3. Minimize special cases
 * 4. Clear separation between syntactic and semantic information
 * 5. Alignment with ethdebug format terminology and structure
 */

import * as Format from "@ethdebug/format";

export type SourceLocation = NonNullable<Format.Materials.SourceRange["range"]>;

export const isSourceLocation = (loc: unknown): loc is SourceLocation =>
  Format.Materials.isSourceRange({ source: { id: "pending" }, range: loc });

// ID type for AST nodes - using string type with numeric identifiers
export type Id = string;

export type Node =
  | Program
  | Declaration
  | Block
  | Type
  | Statement
  | Expression;

export namespace Node {
  export interface Base {
    id: Id;
    kind: string;
    loc: SourceLocation | null;
  }

  export const isBase = (node: unknown): node is Node.Base =>
    typeof node === "object" &&
    !!node &&
    "id" in node &&
    typeof node.id === "string" &&
    "kind" in node &&
    typeof node.kind === "string" &&
    !!node.kind &&
    "loc" in node &&
    (node.loc === null || isSourceLocation(node.loc));

  export function clone<T extends Node>(node: T): T {
    const clone = { ...node };

    // Deep clone child nodes
    for (const [key, value] of Object.entries(clone)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          (clone as unknown as Record<string, unknown>)[key] = value.map(
            (item) =>
              item && typeof item === "object" && "kind" in item
                ? Node.clone(item)
                : item,
          );
        } else if ("kind" in value) {
          (clone as unknown as Record<string, unknown>)[key] =
            Node.clone(value);
        }
      }
    }

    return clone;
  }

  export function update<T extends Node>(node: T, updates: Partial<T>): T {
    return { ...node, ...updates };
  }
}

// Program structure

export interface Program extends Node.Base {
  kind: "program";
  name: string;
  definitions?: Block.Definitions; // All top-level declarations
  storage?: Declaration.Storage[];
  create?: Block.Statements; // Constructor code block (may be empty)
  body?: Block.Statements; // Runtime code block (may be empty)
}

export function program(
  id: Id,
  name: string,
  storage?: Declaration.Storage[],
  definitions?: Block.Definitions,
  body?: Block.Statements,
  create?: Block.Statements,
  loc?: SourceLocation,
): Program {
  return {
    id,
    kind: "program",
    name,
    storage,
    definitions,
    body,
    create,
    loc: loc ?? null,
  };
}

export const isProgram = (program: unknown): program is Program =>
  Node.isBase(program) &&
  program.kind === "Program" &&
  "name" in program &&
  typeof program.name === "string" &&
  "declarations" in program &&
  Array.isArray(program.declarations) &&
  program.declarations.every(isDeclaration); //&&
// "create" in program && isBlock(program.create) &&
// "body" in program && isBlock(program.body);

export type Declaration =
  | Declaration.Struct
  | Declaration.Field
  | Declaration.Storage
  | Declaration.Variable
  | Declaration.Function
  | Declaration.Parameter;

export const isDeclaration = (node: unknown): node is Declaration =>
  Declaration.isBase(node) &&
  [
    Declaration.isStruct,
    Declaration.isField,
    Declaration.isStorage,
    Declaration.isVariable,
    Declaration.isFunction,
    Declaration.isParameter,
  ].some((guard) => guard(node));

export namespace Declaration {
  export interface Base extends Node.Base {
    kind: `declaration:${string}`;
    name: string;
  }

  export const isBase = (
    declaration: unknown,
  ): declaration is Declaration.Base =>
    Node.isBase(declaration) &&
    declaration.kind.startsWith("declaration") &&
    "name" in declaration &&
    typeof declaration.name === "string";

  export interface Struct extends Declaration.Base {
    kind: "declaration:struct";
    fields: Declaration[];
  }

  export function struct(
    id: Id,
    name: string,
    fields: Declaration.Field[],
    loc?: SourceLocation,
  ): Declaration.Struct {
    return {
      id,
      kind: "declaration:struct",
      name,
      fields,
      loc: loc ?? null,
    };
  }

  export const isStruct = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Struct =>
    "kind" in declaration && declaration.kind === "declaration:struct";

  export interface Field extends Declaration.Base {
    kind: "declaration:field";
    type: Type;
    initializer?: Expression;
  }

  export function field(
    id: Id,
    name: string,
    type: Type,
    initializer?: Expression,
    loc?: SourceLocation,
  ): Declaration.Field {
    return {
      id,
      kind: "declaration:field",
      name,
      type,
      initializer,
      loc: loc ?? null,
    };
  }

  export const isField = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Field =>
    "kind" in declaration && declaration.kind === "declaration:field";

  export interface Storage extends Declaration.Base {
    kind: "declaration:storage";
    type: Type;
    slot: number;
  }

  export function storage(
    id: Id,
    name: string,
    type: Type,
    slot: number,
    loc?: SourceLocation,
  ): Declaration.Storage {
    return {
      id,
      kind: "declaration:storage",
      name,
      type,
      slot,
      loc: loc ?? null,
    };
  }

  export const isStorage = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Storage =>
    "kind" in declaration && declaration.kind === "declaration:storage";

  export interface Variable extends Declaration.Base {
    kind: "declaration:variable";
    type?: Type;
    initializer?: Expression;
  }

  export function variable(
    id: Id,
    name: string,
    type?: Type,
    initializer?: Expression,
    loc?: SourceLocation,
  ): Declaration.Variable {
    return {
      id,
      kind: "declaration:variable",
      name,
      type,
      initializer,
      loc: loc ?? null,
    };
  }

  export const isVariable = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Variable =>
    "kind" in declaration && declaration.kind === "declaration:variable";

  export interface Function extends Declaration.Base {
    kind: "declaration:function";
    parameters: Declaration.Parameter[];
    returnType?: Type;
    body: Block;
  }

  export function function_(
    id: Id,
    name: string,
    parameters: Declaration.Parameter[],
    returnType: Type | undefined,
    body: Block,
    loc?: SourceLocation,
  ): Declaration.Function {
    return {
      id,
      kind: "declaration:function",
      name,
      parameters,
      returnType,
      body,
      loc: loc ?? null,
    };
  }

  export const isFunction = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Function =>
    "kind" in declaration && declaration.kind === "declaration:function";

  export interface Parameter extends Declaration.Base {
    kind: "declaration:parameter";
    name: string;
    type: Type;
  }

  export function parameter(
    id: Id,
    name: string,
    type: Type,
    loc?: SourceLocation,
  ): Declaration.Parameter {
    return {
      id,
      kind: "declaration:parameter",
      name,
      type,
      loc: loc ?? null,
    };
  }

  export const isParameter = (
    declaration: Declaration.Base,
  ): declaration is Declaration.Parameter =>
    declaration.kind === "declaration:parameter";
}

// Data locations aligned with ethdebug format
export type DataLocation =
  | "storage"
  | "memory"
  | "stack"
  | "calldata"
  | "returndata"
  | "transient"
  | "code";

// Unified Block pattern
// Covers: code blocks, storage blocks, statement blocks

export type Block = Block.Statements | Block.Definitions;

export const isBlock = (block: unknown): block is Block =>
  Block.isBase(block) &&
  [Block.isStatements, Block.isDefinitions].some((guard) => guard(block));

export namespace Block {
  export interface Base extends Node.Base {
    kind: `block:${string}`;
  }

  export const isBase = (block: unknown): block is Block.Base =>
    Node.isBase(block) && block.kind.startsWith("block:");

  export interface Statements extends Block.Base {
    kind: "block:statements";
    items: Statement[];
  }

  export function statements(
    id: Id,
    items: Statement[],
    loc?: SourceLocation,
  ): Block.Statements {
    return { id, kind: "block:statements", items, loc: loc ?? null };
  }

  export const isStatements = (block: Block.Base): block is Block.Statements =>
    block.kind === "block:statements";

  export interface Definitions extends Block.Base {
    kind: "block:definitions";
    items: Declaration[];
  }

  export function definitions(
    id: Id,
    items: Declaration[],
    loc?: SourceLocation,
  ): Block.Definitions {
    return { id, kind: "block:definitions", items, loc: loc ?? null };
  }

  export const isDefinitions = (
    block: Block.Base,
  ): block is Block.Definitions => block.kind === "block:definitions";
}

// Type nodes - aligned with ethdebug format

export type Type = Type.Elementary | Type.Complex | Type.Reference;

export const isType = (node: unknown): node is Type => Type.isBase(node);

export namespace Type {
  export interface Base extends Node.Base {
    kind: `type:${string}`;
  }

  export const isBase = (type: unknown): type is Type.Base =>
    Node.isBase(type) && type.kind.startsWith("type:");

  export type Elementary =
    | Elementary.Uint
    | Elementary.Int
    | Elementary.Address
    | Elementary.Bool
    | Elementary.Bytes
    | Elementary.String
    | Elementary.Fixed
    | Elementary.Ufixed;

  export const isElementary = (type: Type.Base): type is Elementary =>
    type.kind.startsWith("type:elementary:");

  export namespace Elementary {
    export interface Base extends Type.Base {
      kind: `type:elementary:${string}`;
    }

    export const isBase = (type: Type.Base): type is Elementary.Base =>
      type.kind.startsWith("type:elementary:");
    export interface Uint extends Elementary.Base {
      kind: "type:elementary:uint";
      bits: number;
    }

    export const isUint = (type: Type.Base): type is Uint =>
      type.kind === "type:elementary:uint";

    export function uint(
      id: Id,
      bits: number = 256,
      loc?: SourceLocation,
    ): Uint {
      return { id, kind: "type:elementary:uint", bits, loc: loc ?? null };
    }

    export interface Int extends Elementary.Base {
      kind: "type:elementary:int";
      bits: number;
    }

    export const isInt = (type: Type.Base): type is Int =>
      type.kind === "type:elementary:int";

    export function int(id: Id, bits: number = 256, loc?: SourceLocation): Int {
      return { id, kind: "type:elementary:int", bits, loc: loc ?? null };
    }

    export interface Address extends Elementary.Base {
      kind: "type:elementary:address";
    }

    export const isAddress = (type: Type.Base): type is Address =>
      type.kind === "type:elementary:address";

    export function address(id: Id, loc?: SourceLocation): Address {
      return { id, kind: "type:elementary:address", loc: loc ?? null };
    }

    export interface Bool extends Elementary.Base {
      kind: "type:elementary:bool";
    }

    export const isBool = (type: Type.Base): type is Bool =>
      type.kind === "type:elementary:bool";

    export function bool(id: Id, loc?: SourceLocation): Bool {
      return { id, kind: "type:elementary:bool", loc: loc ?? null };
    }

    export interface Bytes extends Elementary.Base {
      kind: "type:elementary:bytes";
      size?: number;
    }

    export const isBytes = (type: Type.Base): type is Bytes =>
      type.kind === "type:elementary:bytes";

    export function bytes(id: Id, size?: number, loc?: SourceLocation): Bytes {
      return { id, kind: "type:elementary:bytes", size, loc: loc ?? null };
    }

    export interface String extends Elementary.Base {
      kind: "type:elementary:string";
    }

    export const isString = (type: Type.Base): type is Type.Elementary.String =>
      type.kind === "type:elementary:string";

    export function string(
      id: Id,
      loc?: SourceLocation,
    ): Type.Elementary.String {
      return { id, kind: "type:elementary:string", loc: loc ?? null };
    }

    export interface Fixed extends Elementary.Base {
      kind: "type:elementary:fixed";
      bits: number;
    }

    export const isFixed = (type: Type.Base): type is Fixed =>
      type.kind === "type:elementary:fixed";

    export function fixed(
      id: Id,
      bits: number = 128,
      loc?: SourceLocation,
    ): Fixed {
      return { id, kind: "type:elementary:fixed", bits, loc: loc ?? null };
    }

    export interface Ufixed extends Elementary.Base {
      kind: "type:elementary:ufixed";
      bits: number;
    }

    export const isUfixed = (type: Type.Base): type is Ufixed =>
      type.kind === "type:elementary:ufixed";

    export function ufixed(
      id: Id,
      bits: number = 128,
      loc?: SourceLocation,
    ): Ufixed {
      return { id, kind: "type:elementary:ufixed", bits, loc: loc ?? null };
    }
  }

  export type Complex =
    | Complex.Array
    | Complex.Mapping
    | Complex.Struct
    | Complex.Tuple
    | Complex.Function
    | Complex.Alias
    | Complex.Contract
    | Complex.Enum;

  export const isComplex = (type: Type.Base): type is Complex =>
    type.kind.startsWith("type:complex:");

  export namespace Complex {
    export interface Base extends Type.Base {
      kind: `type:complex:${string}`;
    }

    export const isBase = (type: Type.Base): type is Complex.Base =>
      type.kind.startsWith("type:complex:");
    export interface Array extends Complex.Base {
      kind: "type:complex:array";
      element: Type;
      size?: number;
    }

    export const isArray = (type: Type.Base): type is Array =>
      type.kind === "type:complex:array";

    export function array(
      id: Id,
      element: Type,
      size?: number,
      loc?: SourceLocation,
    ): Array {
      return {
        id,
        kind: "type:complex:array",
        element,
        size,
        loc: loc ?? null,
      };
    }

    export interface Mapping extends Complex.Base {
      kind: "type:complex:mapping";
      key: Type;
      value: Type;
    }

    export const isMapping = (type: Type.Base): type is Mapping =>
      type.kind === "type:complex:mapping";

    export function mapping(
      id: Id,
      key: Type,
      value: Type,
      loc?: SourceLocation,
    ): Mapping {
      return { id, kind: "type:complex:mapping", key, value, loc: loc ?? null };
    }

    export interface Struct extends Complex.Base {
      kind: "type:complex:struct";
      fields: Map<string, Type>;
    }

    export const isStruct = (type: Type.Base): type is Struct =>
      type.kind === "type:complex:struct";

    export function struct(
      id: Id,
      fields: Map<string, Type>,
      loc?: SourceLocation,
    ): Struct {
      return { id, kind: "type:complex:struct", fields, loc: loc ?? null };
    }

    export interface Tuple extends Complex.Base {
      kind: "type:complex:tuple";
      members: Type[];
    }

    export const isTuple = (type: Type.Base): type is Tuple =>
      type.kind === "type:complex:tuple";

    export function tuple(
      id: Id,
      members: Type[],
      loc?: SourceLocation,
    ): Tuple {
      return { id, kind: "type:complex:tuple", members, loc: loc ?? null };
    }

    export interface Function extends Complex.Base {
      kind: "type:complex:function";
      parameters: Type[];
      returns: Type[];
    }

    export const isFunction = (
      type: Type.Base,
    ): type is Type.Complex.Function => type.kind === "type:complex:function";

    export function function_(
      id: Id,
      parameters: Type[],
      returns: Type[],
      loc?: SourceLocation,
    ): Type.Complex.Function {
      return {
        id,
        kind: "type:complex:function",
        parameters,
        returns,
        loc: loc ?? null,
      };
    }

    export interface Alias extends Complex.Base {
      kind: "type:complex:alias";
      base: Type;
    }

    export const isAlias = (type: Type.Base): type is Alias =>
      type.kind === "type:complex:alias";

    export function alias(id: Id, base: Type, loc?: SourceLocation): Alias {
      return { id, kind: "type:complex:alias", base, loc: loc ?? null };
    }

    export interface Contract extends Complex.Base {
      kind: "type:complex:contract";
      name: string;
    }

    export const isContract = (type: Type.Base): type is Contract =>
      type.kind === "type:complex:contract";

    export function contract(
      id: Id,
      name: string,
      loc?: SourceLocation,
    ): Contract {
      return { id, kind: "type:complex:contract", name, loc: loc ?? null };
    }

    export interface Enum extends Complex.Base {
      kind: "type:complex:enum";
      members: string[];
    }

    export const isEnum = (type: Type.Base): type is Enum =>
      type.kind === "type:complex:enum";

    export function enum_(
      id: Id,
      members: string[],
      loc?: SourceLocation,
    ): Enum {
      return { id, kind: "type:complex:enum", members, loc: loc ?? null };
    }
  }

  export interface Reference extends Type.Base {
    kind: "type:reference";
    name: string;
  }

  export const isReference = (type: Type.Base): type is Reference =>
    type.kind === "type:reference";

  export function reference(
    id: Id,
    name: string,
    loc?: SourceLocation,
  ): Reference {
    return { id, kind: "type:reference", name, loc: loc ?? null };
  }
}

// Statements - unified pattern

export type Statement =
  | Statement.Declare
  | Statement.Assign
  | Statement.ControlFlow
  | Statement.Express;

export const isStatement = (node: unknown): node is Statement =>
  Statement.isBase(node) &&
  [
    Statement.isDeclare,
    Statement.isAssign,
    Statement.isControlFlow,
    Statement.isExpress,
  ].some((guard) => guard(node));

export namespace Statement {
  export interface Base extends Node.Base {
    kind: `statement:${string}`;
  }

  export const isBase = (statement: unknown): statement is Statement.Base =>
    Node.isBase(statement) && statement.kind.startsWith("statement:");

  export interface Declare extends Statement.Base {
    kind: "statement:declare";
    declaration: Declaration;
  }

  export const isDeclare = (
    statement: Statement.Base,
  ): statement is Statement.Declare => statement.kind === "statement:declare";

  export function declare(
    id: Id,
    declaration: Declaration,
    loc?: SourceLocation,
  ): Statement.Declare {
    return { id, kind: "statement:declare", declaration, loc: loc ?? null };
  }

  export interface Assign extends Statement.Base {
    kind: "statement:assign";
    target: Expression; // Must be assignable (validated during semantic analysis)
    value: Expression;
    operator?: string; // For compound assignments like += (future)
  }

  export const isAssign = (
    statement: Statement.Base,
  ): statement is Statement.Assign => statement.kind === "statement:assign";

  export function assign(
    id: Id,
    target: Expression,
    value: Expression,
    operator?: string,
    loc?: SourceLocation,
  ): Statement.Assign {
    return {
      id,
      kind: "statement:assign",
      target,
      value,
      operator,
      loc: loc ?? null,
    };
  }

  export type ControlFlow =
    | Statement.ControlFlow.If
    | Statement.ControlFlow.For
    | Statement.ControlFlow.While
    | Statement.ControlFlow.Return
    | Statement.ControlFlow.Break
    | Statement.ControlFlow.Continue;

  export const isControlFlow = (
    statement: Statement.Base,
  ): statement is Statement.ControlFlow =>
    Statement.ControlFlow.isBase(statement) &&
    [
      Statement.ControlFlow.isIf,
      Statement.ControlFlow.isFor,
      Statement.ControlFlow.isWhile,
      Statement.ControlFlow.isReturn,
      Statement.ControlFlow.isBreak,
      Statement.ControlFlow.isContinue,
    ].some((guard) => guard(statement));

  export namespace ControlFlow {
    export interface Base extends Statement.Base {
      kind: `statement:control-flow:${string}`;
    }

    export const isBase = (
      statement: Statement.Base,
    ): statement is Statement.ControlFlow.Base =>
      statement.kind.startsWith("statement:control-flow:");
    export interface If extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:if";
      condition: Expression;
      body: Block;
      alternate?: Block;
    }

    export const isIf = (statement: Statement.Base): statement is If =>
      statement.kind === "statement:control-flow:if";

    export function if_(
      id: Id,
      condition: Expression,
      body: Block,
      alternate?: Block,
      loc?: SourceLocation,
    ): If {
      return {
        id,
        kind: "statement:control-flow:if",
        condition,
        body,
        alternate,
        loc: loc ?? null,
      };
    }

    export interface For extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:for";
      init?: Statement;
      condition?: Expression;
      update?: Statement;
      body: Block;
    }

    export const isFor = (statement: Statement.Base): statement is For =>
      statement.kind === "statement:control-flow:for";

    export function for_(
      id: Id,
      body: Block,
      init?: Statement,
      condition?: Expression,
      update?: Statement,
      loc?: SourceLocation,
    ): For {
      return {
        id,
        kind: "statement:control-flow:for",
        init,
        condition,
        update,
        body,
        loc: loc ?? null,
      };
    }

    export interface While extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:while";
      condition: Expression;
      body: Block;
    }

    export const isWhile = (statement: Statement.Base): statement is While =>
      statement.kind === "statement:control-flow:while";

    export function while_(
      id: Id,
      condition: Expression,
      body: Block,
      loc?: SourceLocation,
    ): While {
      return {
        id,
        kind: "statement:control-flow:while",
        condition,
        body,
        loc: loc ?? null,
      };
    }

    export interface Return extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:return";
      value?: Expression;
    }

    export const isReturn = (statement: Statement.Base): statement is Return =>
      statement.kind === "statement:control-flow:return";

    export function return_(
      id: Id,
      value?: Expression,
      loc?: SourceLocation,
    ): Return {
      return {
        id,
        kind: "statement:control-flow:return",
        value,
        loc: loc ?? null,
      };
    }

    export interface Break extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:break";
      label?: string;
    }

    export const isBreak = (statement: Statement.Base): statement is Break =>
      statement.kind === "statement:control-flow:break";

    export function break_(
      id: Id,
      label?: string,
      loc?: SourceLocation,
    ): Break {
      return {
        id,
        kind: "statement:control-flow:break",
        label,
        loc: loc ?? null,
      };
    }

    export interface Continue extends Statement.ControlFlow.Base {
      kind: "statement:control-flow:continue";
      label?: string;
    }

    export const isContinue = (
      statement: Statement.Base,
    ): statement is Continue =>
      statement.kind === "statement:control-flow:continue";

    export function continue_(
      id: Id,
      label?: string,
      loc?: SourceLocation,
    ): Continue {
      return {
        id,
        kind: "statement:control-flow:continue",
        label,
        loc: loc ?? null,
      };
    }
  }

  export interface Express extends Statement.Base {
    kind: "statement:express";
    expression: Expression;
  }

  export const isExpress = (
    statement: Statement.Base,
  ): statement is Statement.Express => statement.kind === "statement:express";

  export function express(
    id: Id,
    expression: Expression,
    loc?: SourceLocation,
  ): Statement.Express {
    return { id, kind: "statement:express", expression, loc: loc ?? null };
  }
}

// Expressions - normalized hierarchy

export type Expression =
  | Expression.Identifier
  | Expression.Literal.Number
  | Expression.Literal.String
  | Expression.Literal.Boolean
  | Expression.Literal.Address
  | Expression.Literal.Hex
  | Expression.Array
  | Expression.Struct
  | Expression.Operator
  | Expression.Access
  | Expression.Call
  | Expression.Cast
  | Expression.Special;

export const isExpression = (node: unknown): node is Expression =>
  Expression.isBase(node) &&
  [
    Expression.isIdentifier,
    Expression.isLiteral,
    Expression.isArray,
    Expression.isStruct,
    Expression.isOperator,
    Expression.isAccess,
    Expression.isCall,
    Expression.isCast,
    Expression.isSpecial,
  ].some((guard) => guard(node));

export namespace Expression {
  export interface Base extends Node.Base {
    kind: `expression:${string}`;
  }

  export const isBase = (expression: unknown): expression is Expression.Base =>
    Node.isBase(expression) && expression.kind.startsWith("expression:");
  export function isAssignable(expr: Expression): boolean {
    // Only certain expressions can be assigned to
    return (
      expr.kind === "expression:identifier" ||
      expr.kind.startsWith("expression:access")
    );
  }

  export interface Identifier extends Expression.Base {
    kind: "expression:identifier";
    name: string;
  }

  export const isIdentifier = (
    expression: Node.Base,
  ): expression is Expression.Identifier =>
    expression.kind === "expression:identifier" &&
    "name" in expression &&
    typeof expression.name === "string";

  export function identifier(
    id: Id,
    name: string,
    loc?: SourceLocation,
  ): Expression.Identifier {
    return { id, kind: "expression:identifier", name, loc: loc ?? null };
  }

  export type Literal =
    | Expression.Literal.Number
    | Expression.Literal.String
    | Expression.Literal.Boolean
    | Expression.Literal.Address
    | Expression.Literal.Hex;

  export const isLiteral = (
    expression: Expression.Base,
  ): expression is Expression.Literal =>
    Expression.Literal.isBase(expression) &&
    [
      Expression.Literal.isNumber,
      Expression.Literal.isString,
      Expression.Literal.isBoolean,
      Expression.Literal.isAddress,
      Expression.Literal.isHex,
    ].some((guard) => guard(expression));

  export namespace Literal {
    export interface Base extends Expression.Base {
      kind: `expression:literal:${string}`;
      value: string;
    }

    export const isBase = (
      expression: Expression.Base,
    ): expression is Expression.Literal.Base =>
      expression.kind.startsWith("expression:literal:") &&
      "value" in expression &&
      typeof expression.value === "string";

    export interface Number extends Expression.Literal.Base {
      kind: "expression:literal:number";
      unit?: string;
    }

    export const isNumber = (
      expression: Expression.Base,
    ): expression is Expression.Literal.Number =>
      expression.kind === "expression:literal:number";

    export function number(
      id: Id,
      value: string,
      unit?: string,
      loc?: SourceLocation,
    ): Expression.Literal.Number {
      return {
        id,
        kind: "expression:literal:number",
        value,
        unit,
        loc: loc ?? null,
      };
    }

    export interface String extends Expression.Literal.Base {
      kind: "expression:literal:string";
    }

    export const isString = (
      expression: Expression.Base,
    ): expression is Expression.Literal.String =>
      expression.kind === "expression:literal:string";

    export function string(
      id: Id,
      value: string,
      loc?: SourceLocation,
    ): Expression.Literal.String {
      return { id, kind: "expression:literal:string", value, loc: loc ?? null };
    }

    export interface Boolean extends Expression.Literal.Base {
      kind: "expression:literal:boolean";
    }

    export const isBoolean = (
      expression: Expression.Base,
    ): expression is Expression.Literal.Boolean =>
      expression.kind === "expression:literal:boolean";

    export function boolean(
      id: Id,
      value: string,
      loc?: SourceLocation,
    ): Expression.Literal.Boolean {
      return {
        id,
        kind: "expression:literal:boolean",
        value,
        loc: loc ?? null,
      };
    }

    export interface Address extends Expression.Literal.Base {
      kind: "expression:literal:address";
    }

    export const isAddress = (
      expression: Expression.Base,
    ): expression is Expression.Literal.Address =>
      expression.kind === "expression:literal:address";

    export function address(
      id: Id,
      value: string,
      loc?: SourceLocation,
    ): Expression.Literal.Address {
      return {
        id,
        kind: "expression:literal:address",
        value,
        loc: loc ?? null,
      };
    }

    export interface Hex extends Expression.Literal.Base {
      kind: "expression:literal:hex";
    }

    export const isHex = (
      expression: Expression.Base,
    ): expression is Expression.Literal.Hex =>
      expression.kind === "expression:literal:hex";

    export function hex(
      id: Id,
      value: string,
      loc?: SourceLocation,
    ): Expression.Literal.Hex {
      return { id, kind: "expression:literal:hex", value, loc: loc ?? null };
    }
  }

  // Use underscore pattern to avoid conflict with built-in Array
  export interface Array extends Expression.Base {
    kind: "expression:array";
    elements: readonly Expression[];
  }

  export const isArray = (
    expression: Node.Base,
  ): expression is Expression.Array =>
    expression.kind === "expression:array" &&
    "elements" in expression &&
    Array_.isArray(expression.elements) &&
    expression.elements.every(isExpression);

  export function array(
    id: Id,
    elements: readonly Expression[],
    loc?: SourceLocation,
  ): Expression.Array {
    return {
      id,
      kind: "expression:array",
      elements,
      loc: loc ?? null,
    };
  }

  export interface Struct extends Expression.Base {
    kind: "expression:struct";
    structName?: string; // Optional struct type name
    fields: readonly {
      name: string;
      value: Expression;
    }[];
  }

  export const isStruct = (
    expression: Node.Base,
  ): expression is Expression.Struct =>
    expression.kind === "expression:struct" &&
    "fields" in expression &&
    Array_.isArray(expression.fields) &&
    expression.fields.every(
      (field: unknown) =>
        typeof field === "object" &&
        field !== null &&
        "name" in field &&
        typeof field.name === "string" &&
        "value" in field &&
        isExpression(field.value),
    );

  export function struct(
    id: Id,
    fields: readonly { name: string; value: Expression }[],
    structName?: string,
    loc?: SourceLocation,
  ): Expression.Struct {
    return {
      id,
      kind: "expression:struct",
      structName,
      fields,
      loc: loc ?? null,
    };
  }

  export interface Operator extends Expression.Base {
    kind: "expression:operator";
    operator: string;
    operands: readonly [Expression] | readonly [Expression, Expression];
  }

  export const isOperator = (
    expression: Node.Base,
  ): expression is Expression.Operator =>
    expression.kind === "expression:operator" &&
    "operator" in expression &&
    typeof expression.operator === "string" &&
    "operands" in expression &&
    Array.isArray(expression.operands);

  export function operator(
    id: Id,
    operator: string,
    operands: readonly [Expression] | readonly [Expression, Expression],
    loc?: SourceLocation,
  ): Expression.Operator {
    return {
      id,
      kind: "expression:operator",
      operator,
      operands,
      loc: loc ?? null,
    };
  }

  export type Access =
    | Expression.Access.Member
    | Expression.Access.Slice
    | Expression.Access.Index;

  export const isAccess = (
    expression: Node.Base,
  ): expression is Expression.Access =>
    Expression.Access.isBase(expression) &&
    [
      Expression.Access.isMember,
      Expression.Access.isSlice,
      Expression.Access.isIndex,
    ].some((guard) => guard(expression));

  export namespace Access {
    export interface Base extends Expression.Base {
      kind: `expression:access:${string}`;
      object: Expression;
    }

    export const isBase = (access: unknown): access is Expression.Access.Base =>
      Node.isBase(access) &&
      access.kind.startsWith("expression:access:") &&
      "object" in access &&
      isExpression(access.object);

    export interface Member extends Expression.Access.Base {
      kind: "expression:access:member";
      property: string;
    }

    export function member(
      id: Id,
      object: Expression,
      property: string,
      loc?: SourceLocation,
    ): Expression.Access.Member {
      return {
        id,
        kind: "expression:access:member",
        object,
        property,
        loc: loc ?? null,
      };
    }

    export const isMember = (
      access: Expression.Access.Base,
    ): access is Expression.Access.Member =>
      access.kind === "expression:access:member";

    export interface Slice extends Expression.Access.Base {
      kind: "expression:access:slice";
      start: Expression;
      end: Expression;
    }

    export function slice(
      id: Id,
      object: Expression,
      start: Expression,
      end: Expression,
      loc?: SourceLocation,
    ): Expression.Access.Slice {
      return {
        id,
        kind: "expression:access:slice",
        object,
        start,
        end,
        loc: loc ?? null,
      };
    }

    export const isSlice = (
      access: Expression.Access.Base,
    ): access is Expression.Access.Slice =>
      access.kind === "expression:access:slice";

    export interface Index extends Expression.Access.Base {
      kind: "expression:access:index";
      index: Expression;
    }

    export function index(
      id: Id,
      object: Expression,
      index: Expression,
      loc?: SourceLocation,
    ): Expression.Access.Index {
      return {
        id,
        kind: "expression:access:index",
        object,
        index,
        loc: loc ?? null,
      };
    }

    export const isIndex = (
      access: Expression.Access.Base,
    ): access is Expression.Access.Index =>
      access.kind === "expression:access:index";
  }

  export interface Call extends Expression.Base {
    kind: "expression:call";
    callee: Expression;
    arguments: Expression[];
  }

  export const isCall = (
    expression: Node.Base,
  ): expression is Expression.Call =>
    expression.kind === "expression:call" &&
    "callee" in expression &&
    typeof expression.callee === "object" &&
    "arguments" in expression &&
    Array.isArray(expression.arguments);

  export function call(
    id: Id,
    callee: Expression,
    args: Expression[],
    loc?: SourceLocation,
  ): Expression.Call {
    return {
      id,
      kind: "expression:call",
      callee,
      arguments: args,
      loc: loc ?? null,
    };
  }

  export interface Cast extends Expression.Base {
    kind: "expression:cast";
    expression: Expression;
    targetType: Type;
  }

  export const isCast = (
    expression: Node.Base,
  ): expression is Expression.Cast =>
    expression.kind === "expression:cast" &&
    "expression" in expression &&
    typeof expression.expression === "object" &&
    "targetType" in expression &&
    typeof expression.targetType === "object";

  export function cast(
    id: Id,
    expression: Expression,
    targetType: Type,
    loc?: SourceLocation,
  ): Expression.Cast {
    return {
      id,
      kind: "expression:cast",
      expression,
      targetType,
      loc: loc ?? null,
    };
  }

  export type Special =
    | Expression.Special.MsgSender
    | Expression.Special.MsgValue
    | Expression.Special.MsgData
    | Expression.Special.BlockTimestamp
    | Expression.Special.BlockNumber;

  export const isSpecial = (
    expression: Expression.Base,
  ): expression is Expression.Special =>
    Expression.Special.isBase(expression) &&
    [
      Expression.Special.isMsgData,
      Expression.Special.isMsgValue,
      Expression.Special.isMsgSender,
      Expression.Special.isBlockNumber,
      Expression.Special.isBlockTimestamp,
    ].some((guard) => guard(expression));

  export namespace Special {
    export interface Base extends Expression.Base {
      kind: `expression:special:${string}`;
    }

    export const isBase = (expression: Expression.Base): expression is Base =>
      expression.kind.startsWith("expression:special:");

    export interface MsgSender extends Expression.Special.Base {
      kind: "expression:special:msg.sender";
    }

    export const isMsgSender = (
      expression: Expression.Base,
    ): expression is MsgSender =>
      expression.kind === "expression:special:msg.sender";

    export function msgSender(id: Id, loc?: SourceLocation): MsgSender {
      return { id, kind: "expression:special:msg.sender", loc: loc ?? null };
    }

    export interface MsgValue extends Expression.Special.Base {
      kind: "expression:special:msg.value";
    }

    export const isMsgValue = (
      expression: Expression.Base,
    ): expression is MsgValue =>
      expression.kind === "expression:special:msg.value";

    export function msgValue(id: Id, loc?: SourceLocation): MsgValue {
      return { id, kind: "expression:special:msg.value", loc: loc ?? null };
    }

    export interface MsgData extends Expression.Special.Base {
      kind: "expression:special:msg.data";
    }

    export const isMsgData = (
      expression: Expression.Base,
    ): expression is MsgData =>
      expression.kind === "expression:special:msg.data";

    export function msgData(id: Id, loc?: SourceLocation): MsgData {
      return { id, kind: "expression:special:msg.data", loc: loc ?? null };
    }

    export interface BlockTimestamp extends Base {
      kind: "expression:special:block.timestamp";
    }

    export const isBlockTimestamp = (
      expression: Expression.Base,
    ): expression is BlockTimestamp =>
      expression.kind === "expression:special:block.timestamp";

    export function blockTimestamp(
      id: Id,
      loc?: SourceLocation,
    ): BlockTimestamp {
      return {
        id,
        kind: "expression:special:block.timestamp",
        loc: loc ?? null,
      };
    }

    export interface BlockNumber extends Base {
      kind: "expression:special:block.number";
    }

    export const isBlockNumber = (
      expression: Expression.Base,
    ): expression is BlockNumber =>
      expression.kind === "expression:special:block.number";

    export function blockNumber(id: Id, loc?: SourceLocation): BlockNumber {
      return { id, kind: "expression:special:block.number", loc: loc ?? null };
    }
  }
}

type Array_<T> = Array<T>;
const Array_ = Array;
