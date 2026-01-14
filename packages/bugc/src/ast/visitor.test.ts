import { describe, it, expect } from "vitest";

import * as Ast from "#ast";

// Helper to create test IDs
let testIdCounter = 0;
const createId = (): Ast.Id => `test-${testIdCounter++}` as Ast.Id;

describe("Visitor Pattern", () => {
  class TestVisitor implements Ast.Visitor<string, never> {
    program(node: Ast.Program): string {
      return `Program(${node.name})`;
    }
    declaration(node: Ast.Declaration): string {
      return `Declaration(${node.kind}:${node.name})`;
    }
    block(node: Ast.Block): string {
      return `Block(${node.kind})`;
    }
    type(node: Ast.Type): string {
      if (node.kind.startsWith("type:elementary:")) {
        return `ElementaryType(${node.kind}${"bits" in node ? node.bits : ""})`;
      } else if (node.kind.startsWith("type:complex:")) {
        return `ComplexType(${node.kind})`;
      } else if (node.kind === "type:reference") {
        return `ReferenceType(${(node as Ast.Type.Reference).name})`;
      }
      return `Type(${node.kind})`;
    }
    statement(node: Ast.Statement): string {
      if (node.kind === "statement:declare") {
        return "DeclarationStatement";
      } else if (node.kind === "statement:assign") {
        return "AssignmentStatement";
      } else if (node.kind.startsWith("statement:control-flow:")) {
        return `ControlFlowStatement(${node.kind})`;
      } else if (node.kind === "statement:express") {
        return "ExpressionStatement";
      }
      return `Statement(${node.kind})`;
    }
    expression(node: Ast.Expression): string {
      if (node.kind === "expression:identifier") {
        return `Identifier(${(node as Ast.Expression.Identifier).name})`;
      } else if (node.kind.startsWith("expression:literal:")) {
        return `Literal(${node.kind}:${(node as Ast.Expression.Literal).value})`;
      } else if (node.kind === "expression:array") {
        return `Array(${(node as Ast.Expression.Array).elements.length} elements)`;
      } else if (node.kind === "expression:struct") {
        return `Struct(${(node as Ast.Expression.Struct).fields.length} fields)`;
      } else if (node.kind === "expression:operator") {
        return `Operator(${(node as Ast.Expression.Operator).operator})`;
      } else if (node.kind.startsWith("expression:access:")) {
        return `Access(${node.kind})`;
      } else if (node.kind === "expression:call") {
        return "Call";
      } else if (node.kind.startsWith("expression:special:")) {
        return `Special(${node.kind})`;
      } else if (node.kind === "expression:cast") {
        return "Cast";
      }
      return `Expression(${node.kind})`;
    }
  }

  it("should visit all node types", () => {
    const visitor = new TestVisitor();

    expect(
      Ast.visit(
        visitor,
        Ast.program(
          createId(),
          "Test",
          undefined,
          Ast.Block.definitions(createId(), []),
          Ast.Block.statements(createId(), []),
          Ast.Block.statements(createId(), []),
        ),
        undefined as never,
      ),
    ).toBe("Program(Test)");
    expect(
      Ast.visit(
        visitor,
        Ast.Declaration.variable(createId(), "x"),
        undefined as never,
      ),
    ).toBe("Declaration(declaration:variable:x)");
    expect(
      Ast.visit(
        visitor,
        Ast.Block.statements(createId(), []),
        undefined as never,
      ),
    ).toBe("Block(block:statements)");
    expect(
      Ast.visit(
        visitor,
        Ast.Type.Elementary.uint(createId(), 256),
        undefined as never,
      ),
    ).toBe("ElementaryType(type:elementary:uint256)");
    expect(
      Ast.visit(
        visitor,
        Ast.Type.Complex.array(
          createId(),
          Ast.Type.Elementary.uint(createId(), 256),
        ),
        undefined as never,
      ),
    ).toBe("ComplexType(type:complex:array)");
    expect(
      Ast.visit(
        visitor,
        Ast.Type.reference(createId(), "Point"),
        undefined as never,
      ),
    ).toBe("ReferenceType(Point)");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.identifier(createId(), "x"),
        undefined as never,
      ),
    ).toBe("Identifier(x)");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.Literal.number(createId(), "42"),
        undefined as never,
      ),
    ).toBe("Literal(expression:literal:number:42)");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.operator(createId(), "+", [
          Ast.Expression.Literal.number(createId(), "1"),
          Ast.Expression.Literal.number(createId(), "2"),
        ]),
        undefined as never,
      ),
    ).toBe("Operator(+)");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.Access.member(
          createId(),
          Ast.Expression.identifier(createId(), "x"),
          "y",
        ),
        undefined as never,
      ),
    ).toBe("Access(expression:access:member)");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.call(
          createId(),
          Ast.Expression.identifier(createId(), "f"),
          [],
        ),
        undefined as never,
      ),
    ).toBe("Call");
    expect(
      Ast.visit(
        visitor,
        Ast.Expression.Special.msgSender(createId()),
        undefined as never,
      ),
    ).toBe("Special(expression:special:msg.sender)");
    expect(
      Ast.visit(
        visitor,
        Ast.Statement.ControlFlow.if_(
          createId(),
          Ast.Expression.Literal.boolean(createId(), "true"),
          Ast.Block.statements(createId(), []),
        ),
        undefined as never,
      ),
    ).toBe("ControlFlowStatement(statement:control-flow:if)");
  });

  it("should throw on unknown node type", () => {
    const visitor = new TestVisitor();
    const badNode = { kind: "Unknown", loc: null } as unknown as Ast.Node;

    expect(() => Ast.visit(visitor, badNode, undefined as never)).toThrow(
      "Unknown node kind: Unknown",
    );
  });
});
