import * as Ast from "#ast/spec";

export interface Visitor<T, C = never> {
  program(node: Ast.Program, context: C): T;
  declaration(node: Ast.Declaration, context: C): T;
  block(node: Ast.Block, context: C): T;
  type(node: Ast.Type, context: C): T;
  statement(node: Ast.Statement, context: C): T;
  expression(node: Ast.Expression, context: C): T;
}

// Base visitor implementation with kind-based dispatch
export function visit<N extends Ast.Node, T, C = never>(
  visitor: Visitor<T, C>,
  node: N,
  context: C,
): T {
  // Handle top-level kinds
  if (node.kind === "program") {
    return visitor.program(node as Ast.Program, context);
  }

  // Handle hierarchical kinds by checking prefixes
  if (node.kind.startsWith("declaration:")) {
    return visitor.declaration(node as Ast.Declaration, context);
  }

  if (node.kind.startsWith("block:")) {
    return visitor.block(node as Ast.Block, context);
  }

  if (node.kind.startsWith("type:")) {
    return visitor.type(node as Ast.Type, context);
  }

  if (node.kind.startsWith("statement:")) {
    return visitor.statement(node as Ast.Statement, context);
  }

  if (node.kind.startsWith("expression:")) {
    return visitor.expression(node as Ast.Expression, context);
  }

  throw new Error(`Unknown node kind: ${node.kind}`);
}

// More specific visitor interface for detailed traversal
export interface DetailedVisitor<T, C = never> {
  // Program
  program(node: Ast.Program, context: C): T;

  // Declarations
  declarationStruct(node: Ast.Declaration.Struct, context: C): T;
  declarationField(node: Ast.Declaration.Field, context: C): T;
  declarationStorage(node: Ast.Declaration.Storage, context: C): T;
  declarationVariable(node: Ast.Declaration.Variable, context: C): T;
  declarationFunction(node: Ast.Declaration.Function, context: C): T;
  declarationParameter(node: Ast.Declaration.Parameter, context: C): T;

  // Blocks
  blockStatements(node: Ast.Block.Statements, context: C): T;
  blockDefinitions(node: Ast.Block.Definitions, context: C): T;

  // Types
  typeElementary(node: Ast.Type, context: C): T;
  typeComplex(node: Ast.Type, context: C): T;
  typeReference(node: Ast.Type.Reference, context: C): T;

  // Statements
  statementDeclare(node: Ast.Statement.Declare, context: C): T;
  statementAssign(node: Ast.Statement.Assign, context: C): T;
  statementControlFlow(node: Ast.Statement.ControlFlow, context: C): T;
  statementExpress(node: Ast.Statement.Express, context: C): T;

  // Expressions
  expressionIdentifier(node: Ast.Expression.Identifier, context: C): T;
  expressionLiteral(node: Ast.Expression.Literal, context: C): T;
  expressionArray(node: Ast.Expression.Array, context: C): T;
  expressionStruct(node: Ast.Expression.Struct, context: C): T;
  expressionOperator(node: Ast.Expression.Operator, context: C): T;
  expressionAccess(node: Ast.Expression.Access, context: C): T;
  expressionCall(node: Ast.Expression.Call, context: C): T;
  expressionCast(node: Ast.Expression.Cast, context: C): T;
  expressionSpecial(node: Ast.Expression.Special, context: C): T;
}

// Detailed visitor implementation with full kind-based dispatch
export function visitDetailed<N extends Ast.Node, T, C = never>(
  visitor: DetailedVisitor<T, C>,
  node: N,
  context: C,
): T {
  switch (node.kind) {
    // Program
    case "program":
      return visitor.program(node as Ast.Program, context);

    // Declarations
    case "declaration:struct":
      return visitor.declarationStruct(node as Ast.Declaration.Struct, context);
    case "declaration:field":
      return visitor.declarationField(node as Ast.Declaration.Field, context);
    case "declaration:storage":
      return visitor.declarationStorage(
        node as Ast.Declaration.Storage,
        context,
      );
    case "declaration:variable":
      return visitor.declarationVariable(
        node as Ast.Declaration.Variable,
        context,
      );
    case "declaration:function":
      return visitor.declarationFunction(
        node as Ast.Declaration.Function,
        context,
      );
    case "declaration:parameter":
      return visitor.declarationParameter(
        node as Ast.Declaration.Parameter,
        context,
      );

    // Blocks
    case "block:statements":
      return visitor.blockStatements(node as Ast.Block.Statements, context);
    case "block:definitions":
      return visitor.blockDefinitions(node as Ast.Block.Definitions, context);

    // Types
    case "type:elementary:uint":
    case "type:elementary:int":
    case "type:elementary:address":
    case "type:elementary:bool":
    case "type:elementary:bytes":
    case "type:elementary:string":
    case "type:elementary:fixed":
    case "type:elementary:ufixed":
      return visitor.typeElementary(node as Ast.Type, context);
    case "type:complex:array":
    case "type:complex:mapping":
    case "type:complex:struct":
    case "type:complex:tuple":
    case "type:complex:function":
    case "type:complex:alias":
    case "type:complex:contract":
    case "type:complex:enum":
      return visitor.typeComplex(node as Ast.Type, context);
    case "type:reference":
      return visitor.typeReference(node as Ast.Type.Reference, context);

    // Statements
    case "statement:declare":
      return visitor.statementDeclare(node as Ast.Statement.Declare, context);
    case "statement:assign":
      return visitor.statementAssign(node as Ast.Statement.Assign, context);
    case "statement:control-flow:if":
    case "statement:control-flow:for":
    case "statement:control-flow:while":
    case "statement:control-flow:return":
    case "statement:control-flow:break":
    case "statement:control-flow:continue":
      return visitor.statementControlFlow(
        node as Ast.Statement.ControlFlow,
        context,
      );
    case "statement:express":
      return visitor.statementExpress(node as Ast.Statement.Express, context);

    // Expressions
    case "expression:identifier":
      return visitor.expressionIdentifier(
        node as Ast.Expression.Identifier,
        context,
      );
    case "expression:literal:number":
    case "expression:literal:string":
    case "expression:literal:boolean":
    case "expression:literal:address":
    case "expression:literal:hex":
      return visitor.expressionLiteral(node as Ast.Expression.Literal, context);
    case "expression:array":
      return visitor.expressionArray(node as Ast.Expression.Array, context);
    case "expression:struct":
      return visitor.expressionStruct(node as Ast.Expression.Struct, context);
    case "expression:operator":
      return visitor.expressionOperator(
        node as Ast.Expression.Operator,
        context,
      );
    case "expression:access:member":
    case "expression:access:slice":
    case "expression:access:index":
      return visitor.expressionAccess(node as Ast.Expression.Access, context);
    case "expression:call":
      return visitor.expressionCall(node as Ast.Expression.Call, context);
    case "expression:cast":
      return visitor.expressionCast(node as Ast.Expression.Cast, context);
    case "expression:special:msg.sender":
    case "expression:special:msg.value":
    case "expression:special:msg.data":
    case "expression:special:block.timestamp":
    case "expression:special:block.number":
      return visitor.expressionSpecial(node as Ast.Expression.Special, context);

    default:
      throw new Error(`Unknown node kind: ${(node as Ast.Node).kind}`);
  }
}
