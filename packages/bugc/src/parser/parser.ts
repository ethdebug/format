/**
 * BUG parser implementation that generates AST
 */

import P from "parsimmon";
import * as Ast from "#ast";
import { Result } from "#result";
import { Error as ParseError } from "./errors.js";

/**
 * Placeholder ID used for nodes before location-based IDs are assigned
 */
const PENDING_ID = "<pending>" as Ast.Id;

/**
 * Parse a BUG program and return Result
 */
export function parse(input: string): Result<Ast.Program, ParseError> {
  return runParser(parser, input);
}

/**
 * Parser utilities and base definitions
 */

/**
 * Convert Parsimmon's Mark to our SourceLocation format
 */
function toSourceLocation(mark: P.Mark<unknown>): Ast.SourceLocation {
  return {
    offset: mark.start.offset,
    length: mark.end.offset - mark.start.offset,
  };
}

/**
 * Basic parsers
 */

// Comments
const comment = P.alt(
  P.regexp(/\/\/[^\n]*/), // Single line
  P.regexp(/\/\*[^]*?\*\//), // Multi line
);

// Whitespace and comments
const whitespaceOrComment = P.alt(P.whitespace, comment);

// Whitespace (including comments)
const _ = whitespaceOrComment.many().result(undefined);
const __ = whitespaceOrComment.atLeast(1).result(undefined);

// Lexeme: consume trailing whitespace/comments
const lexeme = <T>(p: P.Parser<T>): P.Parser<T> => p.skip(_);

// Keywords - must not be followed by identifier chars
const keyword = (name: string): P.Parser<string> =>
  lexeme(
    P.string(name)
      .notFollowedBy(P.regexp(/[a-zA-Z0-9_]/))
      .desc(`keyword '${name}'`),
  );

// Operators
const operator = (op: string): P.Parser<string> =>
  P.string(op).desc(`operator '${op}'`);

// Tokens with automatic whitespace consumption
const token = (s: string): P.Parser<string> => lexeme(P.string(s));

// Language tokens
const Lang = {
  // Whitespace
  _,
  __,

  // Comments
  comment,

  // Lexeme
  lexeme,

  // Keywords
  keyword,

  // Operators
  operator,

  // Tokens
  token,

  // Parentheses, brackets, braces
  lparen: token("("),
  rparen: token(")"),
  lbracket: token("["),
  rbracket: token("]"),
  lbrace: token("{"),
  rbrace: token("}"),
  semicolon: token(";"),
  comma: token(","),
  colon: token(":"),
  dot: token("."),

  // Assignment
  equals: token("="),
  arrow: token("->"),

  // Binary operators
  plus: token("+"),
  minus: token("-"),
  multiply: token("*"),
  divide: token("/"),
  lt: token("<"),
  gt: token(">"),
  lte: token("<="),
  gte: token(">="),
  eq: token("=="),
  neq: token("!="),
  and: token("&&"),
  or: token("||"),

  // Unary operators
  not: token("!"),

  // Type cast operator
  as: token("as"),

  // Identifiers (must not be keywords)
  identifier: lexeme(
    P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/).chain((name: string) => {
      // Check if it's a reserved keyword
      const keywords = [
        "let",
        "if",
        "else",
        "for",
        "while",
        "return",
        "break",
        "continue",
        "struct",
        "mapping",
        "array",
        "function",
        "storage",
        "code",
        "create",
        "define",
        "msg",
        "true",
        "false",
        "wei",
        "finney",
        "ether",
        "as",
        "uint256",
        "uint128",
        "uint64",
        "uint32",
        "uint16",
        "uint8",
        "int256",
        "int128",
        "int64",
        "int32",
        "int16",
        "int8",
        "address",
        "bool",
        "bytes32",
        "bytes16",
        "bytes8",
        "bytes4",
        "bytes",
        "string",
      ];

      if (keywords.includes(name)) {
        return P.fail(`Cannot use keyword '${name}' as identifier`);
      }
      return P.succeed(name);
    }),
  ),

  // Number literals
  number: lexeme(
    P.regexp(/0x[0-9a-fA-F]+|[0-9]+/)
      .desc("number")
      .map((str) => {
        if (str.startsWith("0x")) {
          return BigInt(str);
        }
        return BigInt(str);
      }),
  ),

  // String literals
  string: lexeme(
    P.regexp(/"([^"\\\n\r]|\\[ntr"\\])*"/)
      .desc("string literal")
      .map((str) => {
        // Remove quotes and process escape sequences
        const content = str.slice(1, -1);
        return content
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\r/g, "\r")
          .replace(/\\\\/g, "\\")
          .replace(/\\"/g, '"');
      }),
  ),

  // Boolean literals
  boolean: lexeme(
    P.alt(P.string("true").result(true), P.string("false").result(false)).desc(
      "boolean literal",
    ),
  ),

  // Address literal (0x followed by exactly 40 hex chars, not followed by more hex chars)
  address: lexeme(
    P.regexp(/0x[0-9a-fA-F]{40}/)
      .notFollowedBy(P.regexp(/[0-9a-fA-F]/))
      .desc("address literal"),
  ),

  // Wei units
  weiUnit: P.alt(keyword("ether"), keyword("finney"), keyword("wei")),

  // Elementary type names - now includes signed integers
  elementaryType: P.alt(
    // Unsigned integers
    keyword("uint256"),
    keyword("uint128"),
    keyword("uint64"),
    keyword("uint32"),
    keyword("uint16"),
    keyword("uint8"),
    // Signed integers
    keyword("int256"),
    keyword("int128"),
    keyword("int64"),
    keyword("int32"),
    keyword("int16"),
    keyword("int8"),
    // Address and bool
    keyword("address"),
    keyword("bool"),
    // Bytes types
    keyword("bytes32"),
    keyword("bytes16"),
    keyword("bytes8"),
    keyword("bytes4"),
    keyword("bytes"),
    // String
    keyword("string"),
  ),

  // Keywords that can't be identifiers
  reservedWord: P.alt(
    // Statement keywords
    keyword("let"),
    keyword("if"),
    keyword("else"),
    keyword("for"),
    keyword("while"),
    keyword("return"),
    keyword("break"),
    keyword("continue"),
    // Type keywords
    keyword("struct"),
    keyword("mapping"),
    keyword("array"),
    keyword("function"),
    // Section keywords
    keyword("name"),
    keyword("storage"),
    keyword("code"),
    // Special
    keyword("msg"),
    // Boolean values (already handled as literals)
    keyword("true"),
    keyword("false"),
  ),
};

/**
 * Helper to create a parser that captures source location
 */
function located<T>(
  parser: P.Parser<T>,
): P.Parser<T & { id: Ast.Id; loc: Ast.SourceLocation }> {
  return parser.mark().map((mark) => {
    const loc = toSourceLocation(mark);
    const id = `${loc.offset}_${loc.length}` as Ast.Id;
    return {
      ...mark.value,
      id, // Replace the pending ID with location-based ID
      loc,
    };
  });
}

/**
 * Helper to run a parser and convert to Result type
 */
function runParser<T>(
  parser: P.Parser<T>,
  input: string,
): Result<T, ParseError> {
  const result = parser.parse(input);

  if (result.status) {
    return Result.ok(result.value);
  } else {
    // Convert Parsimmon position to SourceLocation
    const location: Ast.SourceLocation = {
      offset: result.index.offset,
      length: 1, // We don't know the exact length, so use 1
    };

    // Check if we have a custom error message
    let message = `Parse error at line ${result.index.line}, column ${result.index.column}`;

    // First check if there's a custom message in the expected array
    if (result.expected && result.expected.length > 0) {
      // Look for our custom validation messages in the expected array
      for (const expectedMsg of result.expected) {
        if (
          expectedMsg &&
          (expectedMsg.includes("exceeds maximum safe integer") ||
            expectedMsg.includes("must be positive") ||
            expectedMsg.includes("must be non-negative") ||
            expectedMsg.includes("must be an integer") ||
            expectedMsg.includes("Cannot use keyword"))
        ) {
          message = expectedMsg;
          break;
        }
      }
    }

    const error = new ParseError(message, location, result.expected);

    return Result.err(error);
  }
}

// Forward declarations for recursive parsers
// eslint-disable-next-line prefer-const
let typeExpression: P.Parser<Ast.Type>;
// eslint-disable-next-line prefer-const
let expression: P.Parser<Ast.Expression>;
// eslint-disable-next-line prefer-const
let statement: P.Parser<Ast.Statement>;

/**
 * Type Parsers
 */

// Elementary types with location
const elementaryType = located(
  Lang.elementaryType.map((name: string) => {
    // Parse the type name to extract kind and bits
    if (name.startsWith("uint")) {
      const bits = parseInt(name.substring(4), 10);
      return Ast.Type.Elementary.uint(PENDING_ID, bits);
    } else if (name.startsWith("int")) {
      const bits = parseInt(name.substring(3), 10);
      return Ast.Type.Elementary.int(PENDING_ID, bits);
    } else if (name.startsWith("bytes") && name !== "bytes") {
      const size = parseInt(name.substring(5), 10);
      return Ast.Type.Elementary.bytes(PENDING_ID, size);
    } else if (name === "address") {
      return Ast.Type.Elementary.address(PENDING_ID);
    } else if (name === "bool") {
      return Ast.Type.Elementary.bool(PENDING_ID);
    } else if (name === "string") {
      return Ast.Type.Elementary.string(PENDING_ID);
    } else if (name === "bytes") {
      return Ast.Type.Elementary.bytes(PENDING_ID);
    }
    // This should never happen as elementaryTypeName parser ensures valid names
    throw new Error(`Unknown elementary type: ${name}`);
  }),
);

// Reference type (identifier in type position)
const referenceType = located(
  Lang.identifier.map((name: string) => Ast.Type.reference(PENDING_ID, name)),
);

// Array type: array<Type> or array<Type, Size>
const arrayType = P.lazy(() =>
  located(
    P.seq(
      Lang.keyword("array"),
      Lang.lt,
      typeExpression,
      P.seq(Lang.comma, numberString)
        .map(([_, n]) => n)
        .fallback(null),
      Lang.gt,
    ).chain(([_, __, elementType, size, ___]) => {
      if (size) {
        const sizeNum = Number(size);
        if (sizeNum > Number.MAX_SAFE_INTEGER) {
          return P.fail(
            `Array size ${size} exceeds maximum safe integer (${Number.MAX_SAFE_INTEGER})`,
          );
        }
        if (sizeNum <= 0) {
          return P.fail(`Array size must be positive, got ${sizeNum}`);
        }
      }
      return P.succeed(
        Ast.Type.Complex.array(
          PENDING_ID,
          elementType,
          size ? Number(size) : undefined,
        ),
      );
    }),
  ),
);

// Mapping type: mapping<KeyType, ValueType>
const mappingType = P.lazy(() =>
  located(
    P.seq(
      Lang.keyword("mapping"),
      Lang.lt,
      typeExpression,
      Lang.comma,
      typeExpression,
      Lang.gt,
    ).map(([_, __, keyType, ___, valueType, ____]) =>
      Ast.Type.Complex.mapping(PENDING_ID, keyType, valueType),
    ),
  ),
);

// Complete type expression
typeExpression = P.alt(
  arrayType,
  mappingType,
  elementaryType,
  referenceType, // Must come after keywords
);

/**
 * Expression Parsers
 */

// Identifier expression
const identifier = located(
  Lang.identifier.map((name: string) =>
    Ast.Expression.identifier(PENDING_ID, name),
  ),
);

// Number parser that returns string (not BigInt)
const numberString = Lang.lexeme(P.regexp(/[0-9]+/).desc("number"));

// Hex parser
const hexString = Lang.lexeme(P.regexp(/0x[0-9a-fA-F]+/).desc("hex literal"));

// Literal expressions
const numberLiteral = located(
  numberString.map((value: string) =>
    Ast.Expression.Literal.number(PENDING_ID, value),
  ),
);

const hexLiteral = located(
  hexString.map((value: string) =>
    Ast.Expression.Literal.hex(PENDING_ID, value),
  ),
);

const booleanLiteral = located(
  P.alt(Lang.keyword("true"), Lang.keyword("false")).map((value: string) =>
    Ast.Expression.Literal.boolean(PENDING_ID, value),
  ),
);

const stringLiteral = located(
  Lang.string.map((value: string) =>
    Ast.Expression.Literal.string(PENDING_ID, value),
  ),
);

// Address literal (0x followed by exactly 40 hex chars)
const addressLiteral = located(
  P.regex(/0x[0-9a-fA-F]{40}/)
    .desc("address literal")
    .notFollowedBy(P.regex(/[0-9a-fA-F]/))
    .map((value: string) =>
      Ast.Expression.Literal.address(PENDING_ID, value.toLowerCase()),
    ),
);

// Wei literal (number followed by wei/finney/ether)
const weiLiteral = located(
  P.seq(
    numberString,
    Lang._,
    P.alt(Lang.keyword("wei"), Lang.keyword("finney"), Lang.keyword("ether")),
  ).map(([value, _, unit]) =>
    Ast.Expression.Literal.number(PENDING_ID, value, unit),
  ),
);

// msg.sender, msg.value, and msg.data as special expressions
const msgExpression = located(
  P.seq(
    Lang.keyword("msg"),
    Lang.dot,
    P.alt(Lang.keyword("sender"), Lang.keyword("value"), Lang.keyword("data")),
  ).map(([_, __, property]) => {
    const kind =
      property === "sender"
        ? "msg.sender"
        : property === "value"
          ? "msg.value"
          : "msg.data";
    if (kind === "msg.sender") {
      return Ast.Expression.Special.msgSender(PENDING_ID);
    } else if (kind === "msg.value") {
      return Ast.Expression.Special.msgValue(PENDING_ID);
    } else {
      return Ast.Expression.Special.msgData(PENDING_ID);
    }
  }),
);

// block.timestamp and block.number as special expressions
const blockExpression = located(
  P.seq(
    Lang.keyword("block"),
    Lang.dot,
    P.alt(Lang.keyword("timestamp"), Lang.keyword("number")),
  ).map(([_, __, property]) => {
    const kind = property === "timestamp" ? "block.timestamp" : "block.number";
    if (kind === "block.timestamp") {
      return Ast.Expression.Special.blockTimestamp(PENDING_ID);
    } else {
      return Ast.Expression.Special.blockNumber(PENDING_ID);
    }
  }),
);

// Array literal: [expr1, expr2, ...]
const arrayLiteral = P.lazy(() =>
  P.seq(Lang.lbracket, P.sepBy(expression, Lang.comma), Lang.rbracket).map(
    ([_, elements, __]) => Ast.Expression.array(PENDING_ID, elements),
  ),
);

// Struct literal: StructName { field1: expr1, field2: expr2, ... }
const structLiteral = P.lazy(() => {
  const fieldInit = P.seq(Lang.identifier, Lang.colon, expression).map(
    ([name, _, value]) => ({ name, value }),
  );

  // Only named struct literals for now to avoid ambiguity
  return P.seq(
    Lang.identifier,
    Lang.lbrace,
    P.sepBy(fieldInit, Lang.comma),
    Lang.rbrace,
  ).map(([structName, _, fields, __]) =>
    Ast.Expression.struct(PENDING_ID, fields, structName),
  );
});

// Primary expressions (atoms)
const primaryExpression = P.lazy(() =>
  P.alt(
    weiLiteral,
    addressLiteral,
    hexLiteral,
    numberLiteral,
    booleanLiteral,
    stringLiteral,
    arrayLiteral,
    structLiteral,
    msgExpression,
    blockExpression,
    identifier,
    Lang.lparen.then(expression).skip(Lang.rparen), // Parenthesized
  ),
);

// Postfix expression handles both member and index access
const postfixExpression = P.lazy(() => {
  const memberSuffix = P.seq(Lang.dot, Lang.identifier).map(([_, prop]) => ({
    type: "member" as const,
    property: prop,
  }));

  // Support both index access [expr] and slice access [start:end]
  const indexSuffix = P.seq(
    Lang.lbracket,
    expression,
    P.seq(Lang.colon, expression).or(P.succeed(null)),
    Lang.rbracket,
  ).map(([_, start, endPart, __]) => {
    if (endPart) {
      // Slice access: [start:end]
      return {
        type: "slice" as const,
        property: start,
        end: endPart[1],
      };
    } else {
      // Index access: [expr]
      return {
        type: "index" as const,
        property: start,
      };
    }
  });

  // Function call suffix: (arg1, arg2, ...)
  const callSuffix = P.seq(
    Lang.lparen,
    P.sepBy(expression, Lang.comma),
    Lang.rparen,
  ).map(([_, args, __]) => ({
    type: "call" as const,
    arguments: args,
  }));

  // Type cast suffix: as Type
  const castSuffix = P.seq(Lang.as, typeExpression).map(([_, targetType]) => ({
    type: "cast" as const,
    targetType: targetType,
  }));

  const suffix = P.alt(memberSuffix, indexSuffix, callSuffix, castSuffix);

  // Split into two parsers: inner for creating located intermediate expressions,
  // outer for the main parsing logic
  const innerPostfix = P.seq(primaryExpression, suffix.many()).map(
    ([base, suffixes]) => {
      return suffixes.reduce((obj, suffix) => {
        // Use located for each intermediate expression
        if (suffix.type === "member") {
          return located(
            P.succeed(
              Ast.Expression.Access.member(PENDING_ID, obj, suffix.property),
            ),
          ).tryParse("");
        } else if (suffix.type === "slice") {
          return located(
            P.succeed(
              Ast.Expression.Access.slice(
                PENDING_ID,
                obj,
                suffix.property,
                suffix.end,
              ),
            ),
          ).tryParse("");
        } else if (suffix.type === "call") {
          return located(
            P.succeed(Ast.Expression.call(PENDING_ID, obj, suffix.arguments)),
          ).tryParse("");
        } else if (suffix.type === "cast") {
          return located(
            P.succeed(Ast.Expression.cast(PENDING_ID, obj, suffix.targetType)),
          ).tryParse("");
        } else {
          return located(
            P.succeed(
              Ast.Expression.Access.index(PENDING_ID, obj, suffix.property),
            ),
          ).tryParse("");
        }
      }, base);
    },
  );

  return located(innerPostfix);
});

// Unary expressions
const unaryExpression: P.Parser<Ast.Expression> = P.lazy(() =>
  P.alt(
    located(
      P.seq(P.alt(Lang.not, Lang.minus), unaryExpression).map(
        ([op, expr]: [string, Ast.Expression]) =>
          Ast.Expression.operator(PENDING_ID, op, [expr]),
      ),
    ),
    postfixExpression,
  ),
);

// Binary expression with precedence climbing
const binaryOperators = [
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", ">", "<=", ">="],
  ["+", "-"],
  ["*", "/"],
];

// Build precedence parser
function precedenceParser(
  precedence: number,
  nextParser: P.Parser<Ast.Expression>,
): P.Parser<Ast.Expression> {
  if (precedence >= binaryOperators.length) {
    return nextParser;
  }

  const operators = binaryOperators[precedence];
  // Sort operators by length (descending) to match longer operators first
  const sortedOps = [...operators].sort((a, b) => b.length - a.length);
  const operatorParsers = sortedOps.map((op) =>
    Lang._.then(P.string(op)).skip(Lang._),
  );

  return P.lazy(() =>
    located(
      P.seq(
        precedenceParser(precedence + 1, nextParser),
        P.seq(
          P.alt(...operatorParsers),
          precedenceParser(precedence + 1, nextParser),
        ).many(),
      ).map(([first, rest]) => {
        return rest.reduce((left, [op, right]) => {
          const loc = left.loc &&
            right.loc && {
              offset: left.loc.offset,
              length:
                Number(right.loc.offset) +
                Number(right.loc.length) -
                Number(left.loc.offset),
            };
          return Ast.Expression.operator(
            PENDING_ID,
            op,
            [left, right],
            loc || undefined,
          );
        }, first);
      }),
    ),
  );
}

// Complete expression parser
expression = precedenceParser(0, unaryExpression);

/**
 * Statement Parsers
 */

// Variable declaration: let x = expr; or let x: Type = expr;
const letStatement = located(
  P.seq(
    Lang.keyword("let"),
    located(
      P.seq(
        Lang.identifier,
        // Optional type annotation
        P.seq(Lang.colon, typeExpression)
          .map(([_, type]) => type)
          .fallback(undefined),
        Lang.equals,
        expression,
      ).map(([name, declaredType, __, init]) =>
        Ast.Declaration.variable(PENDING_ID, name, declaredType, init),
      ),
    ),
    Lang.semicolon,
  ).map(([_, declaration, __]) =>
    Ast.Statement.declare(PENDING_ID, declaration),
  ),
);

// Assignment: lvalue = expr;
const assignmentStatement = P.lazy(() =>
  located(
    P.seq(expression, Lang.equals, expression, Lang.semicolon).map(
      ([target, _, value, __]) =>
        Ast.Statement.assign(PENDING_ID, target, value),
    ),
  ),
);

// Expression statement: expr;
const expressionStatement = located(
  P.seq(expression, Lang.semicolon).map(([expr, _]) =>
    Ast.Statement.express(PENDING_ID, expr),
  ),
);

// Return statement: return expr?;
const returnStatement = located(
  P.seq(Lang.keyword("return"), expression.fallback(null), Lang.semicolon).map(
    ([_, value, __]) =>
      Ast.Statement.ControlFlow.return_(PENDING_ID, value || undefined),
  ),
);

// Break statement: break;
const breakStatement = located(
  P.seq(Lang.keyword("break"), Lang.semicolon).map(() =>
    Ast.Statement.ControlFlow.break_(PENDING_ID),
  ),
);

// Block of statements
const blockStatements = located(
  P.lazy(() =>
    P.seq(Lang.lbrace, statement.many(), Lang.rbrace).map(([_, stmts, __]) =>
      Ast.Block.statements(PENDING_ID, stmts),
    ),
  ),
);

// If statement
const ifStatement = P.lazy(() =>
  located(
    P.seq(
      Lang.keyword("if"),
      Lang.lparen,
      expression,
      Lang.rparen,
      blockStatements,
      P.seq(Lang.keyword("else"), blockStatements)
        .map(([_, block]) => block)
        .fallback(undefined),
    ).map(([_, __, condition, ___, thenBlock, elseBlock]) =>
      Ast.Statement.ControlFlow.if_(
        PENDING_ID,
        condition,
        thenBlock,
        elseBlock,
      ),
    ),
  ),
);

// For statement
const forStatement = P.lazy(() =>
  located(
    P.seq(
      Lang.keyword("for"),
      Lang.lparen,
      letStatement,
      expression,
      Lang.semicolon,
      // Update is an assignment without semicolon
      located(
        P.seq(expression, Lang.equals, expression).map(([target, _, value]) =>
          Ast.Statement.assign(PENDING_ID, target, value),
        ),
      ),
      Lang.rparen,
      blockStatements,
    ).map(
      (
        parts: readonly [
          unknown,
          unknown,
          Ast.Statement,
          Ast.Expression,
          unknown,
          Ast.Statement,
          unknown,
          Ast.Block,
        ],
      ) => {
        const init = parts[2];
        const condition = parts[3];
        const update = parts[5];
        const body = parts[7];
        return Ast.Statement.ControlFlow.for_(
          PENDING_ID,
          body,
          init,
          condition,
          update,
        );
      },
    ),
  ),
);

// All statements
statement = P.alt(
  letStatement,
  ifStatement,
  forStatement,
  returnStatement,
  breakStatement,
  assignmentStatement,
  expressionStatement,
);

/**
 * Top-level Parsers
 */

// Field declaration: name: Type
const fieldDeclaration = located(
  P.seq(Lang.identifier, Lang.colon, typeExpression).map(
    ([name, _, fieldType]) =>
      Ast.Declaration.field(PENDING_ID, name, fieldType),
  ),
);

// Struct declaration
const structDeclaration = located(
  P.seq(
    Lang.keyword("struct"),
    Lang.identifier,
    Lang.lbrace,
    fieldDeclaration
      .sepBy(Lang.semicolon)
      .skip(Lang.semicolon.or(P.succeed(null))),
    Lang.rbrace,
  ).map(([_, name, __, fields, ___]) =>
    Ast.Declaration.struct(PENDING_ID, name, fields),
  ),
);

// Function parameter: name: Type
const functionParameter = located(
  P.seq(Lang.identifier, Lang.colon, typeExpression).map(
    ([name, _, paramType]) =>
      Ast.Declaration.parameter(PENDING_ID, name, paramType),
  ),
);

// Function declaration
const functionDeclaration = P.lazy(() =>
  located(
    P.seq(
      Lang.keyword("function"),
      Lang.identifier,
      Lang.lparen,
      functionParameter.sepBy(Lang.comma),
      Lang.rparen,
      P.seq(Lang.arrow, typeExpression)
        .map(([_, returnType]) => returnType)
        .fallback(undefined),
      blockStatements,
    ).map(([_, name, __, params, ___, returnType, body]) =>
      Ast.Declaration.function_(PENDING_ID, name, params, returnType, body),
    ),
  ),
);

// Storage declaration: [slot] name: Type
const storageDeclaration = located(
  P.seq(
    Lang.lbracket,
    numberString,
    Lang.rbracket,
    Lang.identifier,
    Lang.colon,
    typeExpression,
  ).chain(([_, slot, __, name, ___, storageType]) => {
    const slotNum = Number(slot);
    if (slotNum > Number.MAX_SAFE_INTEGER) {
      return P.fail(
        `Storage slot ${slot} exceeds maximum safe integer (${Number.MAX_SAFE_INTEGER})`,
      );
    }
    if (slotNum < 0) {
      return P.fail(`Storage slot must be non-negative, got ${slotNum}`);
    }
    if (!Number.isInteger(slotNum)) {
      return P.fail(`Storage slot must be an integer, got ${slotNum}`);
    }
    return P.succeed(
      Ast.Declaration.storage(PENDING_ID, name, storageType, slotNum),
    );
  }),
);

// Define block - optional, contains user-defined types and functions
const defineBlock = located(
  P.seq(
    Lang.keyword("define"),
    Lang.lbrace,
    P.alt(
      // Non-empty define block - each declaration must end with semicolon
      P.alt(structDeclaration, functionDeclaration)
        .skip(Lang.semicolon)
        .atLeast(1),
      // Empty define block
      P.succeed([]),
    ),
    Lang.rbrace,
  ).map(([_, __, declarations, ___]) =>
    Ast.Block.definitions(PENDING_ID, declarations),
  ),
);

// Storage block - optional
const storageBlock = P.seq(
  Lang.keyword("storage"),
  Lang.lbrace,
  P.alt(
    // Non-empty storage block - each declaration must end with semicolon
    storageDeclaration.skip(Lang.semicolon).atLeast(1),
    // Empty storage block
    P.succeed([]),
  ),
  Lang.rbrace,
).map(([_, __, declarations, ___]) => declarations);

// Create block (constructor code)
const createBlock = located(
  P.seq(Lang.keyword("create"), Lang.lbrace, statement.many(), Lang.rbrace).map(
    ([_, __, stmts, ___]) => Ast.Block.statements(PENDING_ID, stmts),
  ),
);

// Code block (runtime code)
const codeBlock = located(
  P.seq(Lang.keyword("code"), Lang.lbrace, statement.many(), Lang.rbrace).map(
    ([_, __, stmts, ___]) => Ast.Block.statements(PENDING_ID, stmts),
  ),
);

// Program
const program = located(
  P.seq(
    Lang.keyword("name"),
    Lang.identifier,
    Lang.semicolon,
    defineBlock.or(P.succeed(null)),
    storageBlock.or(P.succeed([])),
    createBlock.or(P.succeed(null)),
    codeBlock.or(P.succeed(null)),
  ).map(([_, name, __, defineBlockNode, storageDecls, create, body]) => {
    return Ast.program(
      PENDING_ID,
      name,
      storageDecls,
      defineBlockNode || undefined,
      body || undefined,
      create || undefined,
    );
  }),
);

// Export the parser wrapped with whitespace handling
const parser = P.seq(Lang._, program, Lang._).map(([_, prog, __]) => prog);
