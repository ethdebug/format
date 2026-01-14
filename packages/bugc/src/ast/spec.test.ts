import { describe, it, expect } from "vitest";

import * as Ast from "#ast/spec";

// Helper to create test IDs
let testIdCounter = 0;
const createId = (): Ast.Id => `test-${testIdCounter++}` as Ast.Id;

describe("Ast", () => {
  describe("Factory Functions", () => {
    it("should create program nodes", () => {
      const program = Ast.program(
        createId(),
        "Test",
        [],
        Ast.Block.definitions(createId(), []),
        Ast.Block.statements(createId(), []),
        Ast.Block.statements(createId(), []),
      );
      expect(program.kind).toBe("program");
      expect(program.name).toBe("Test");
      expect(program.definitions?.items).toEqual([]);
      expect(program.body?.kind).toBe("block:statements");
      expect(program.loc).toBeNull();
    });

    it("should create variable declaration nodes", () => {
      const decl = Ast.Declaration.variable(
        createId(),
        "x",
        Ast.Type.Elementary.uint(createId(), 256),
      );
      expect(decl.kind).toBe("declaration:variable");
      expect(decl.name).toBe("x");
      expect(decl.type?.kind).toBe("type:elementary:uint");
    });

    it("should create struct declarations with fields", () => {
      const fields = [
        Ast.Declaration.field(
          createId(),
          "x",
          Ast.Type.Elementary.uint(createId(), 256),
        ),
        Ast.Declaration.field(
          createId(),
          "y",
          Ast.Type.Elementary.uint(createId(), 256),
        ),
      ];
      const struct = Ast.Declaration.struct(createId(), "Point", fields);

      expect(struct.kind).toBe("declaration:struct");
      expect(struct.fields).toHaveLength(2);
      expect(struct.fields[0].name).toBe("x");
    });

    it("should create storage declarations with slot", () => {
      const storage = Ast.Declaration.storage(
        createId(),
        "balance",
        Ast.Type.Elementary.uint(createId(), 256),
        0,
      );

      expect(storage.kind).toBe("declaration:storage");
      expect(storage.slot).toBe(0);
    });

    it("should create block nodes", () => {
      const block = Ast.Block.statements(createId(), [
        Ast.Statement.express(
          createId(),
          Ast.Expression.identifier(createId(), "x"),
        ),
      ]);
      expect(block.kind).toBe("block:statements");
      expect(block.items).toHaveLength(1);
    });

    it("should create type nodes", () => {
      const elementary = Ast.Type.Elementary.uint(createId(), 256);
      expect(elementary.kind).toBe("type:elementary:uint");
      expect(elementary.bits).toBe(256);

      const array = Ast.Type.Complex.array(createId(), elementary, 10);
      expect(array.kind).toBe("type:complex:array");
      expect(array.size).toBe(10);
      expect(array.element).toBeDefined();

      const mapping = Ast.Type.Complex.mapping(
        createId(),
        Ast.Type.Elementary.address(createId()),
        Ast.Type.Elementary.uint(createId(), 256),
      );
      expect(mapping.kind).toBe("type:complex:mapping");
      expect(mapping.key).toBeDefined();
      expect(mapping.value).toBeDefined();

      const ref = Ast.Type.reference(createId(), "Point");
      expect(ref.kind).toBe("type:reference");
      expect(ref.name).toBe("Point");
    });

    it("should create expression nodes", () => {
      const id = Ast.Expression.identifier(createId(), "x");
      expect(id.kind).toBe("expression:identifier");
      expect(id.name).toBe("x");

      const literal = Ast.Expression.Literal.number(createId(), "42");
      expect(literal.kind).toBe("expression:literal:number");
      expect(literal.value).toBe("42");

      const weiLiteral = Ast.Expression.Literal.number(
        createId(),
        "1",
        "ether",
      );
      expect(weiLiteral.unit).toBe("ether");

      const binary = Ast.Expression.operator(createId(), "+", [id, literal]);
      expect(binary.kind).toBe("expression:operator");
      expect(binary.operator).toBe("+");
      expect(binary.operands).toHaveLength(2);

      const unary = Ast.Expression.operator(createId(), "!", [id]);
      expect(unary.operands).toHaveLength(1);

      const member = Ast.Expression.Access.member(createId(), id, "field");
      expect(member.kind).toBe("expression:access:member");
      expect(member.property).toBe("field");

      const index = Ast.Expression.Access.index(createId(), id, literal);
      expect(index.kind).toBe("expression:access:index");
      expect(index.index.kind).toBe("expression:literal:number");

      const call = Ast.Expression.call(createId(), id, [literal]);
      expect(call.kind).toBe("expression:call");
      expect(call.arguments).toHaveLength(1);

      const special = Ast.Expression.Special.msgSender(createId());
      expect(special.kind).toBe("expression:special:msg.sender");
    });

    it("should create statement nodes", () => {
      const declStmt = Ast.Statement.declare(
        createId(),
        Ast.Declaration.variable(
          createId(),
          "x",
          undefined,
          Ast.Expression.Literal.number(createId(), "42"),
        ),
      );
      expect(declStmt.kind).toBe("statement:declare");

      const assign = Ast.Statement.assign(
        createId(),
        Ast.Expression.identifier(createId(), "x"),
        Ast.Expression.Literal.number(createId(), "10"),
      );
      expect(assign.kind).toBe("statement:assign");
      expect(assign.operator).toBeUndefined();

      const compoundAssign = Ast.Statement.assign(
        createId(),
        Ast.Expression.identifier(createId(), "x"),
        Ast.Expression.Literal.number(createId(), "10"),
        "+=",
      );
      expect(compoundAssign.operator).toBe("+=");

      const ifStmt = Ast.Statement.ControlFlow.if_(
        createId(),
        Ast.Expression.Literal.boolean(createId(), "true"),
        Ast.Block.statements(createId(), []),
      );
      expect(ifStmt.kind).toBe("statement:control-flow:if");

      const forStmt = Ast.Statement.ControlFlow.for_(
        createId(),
        Ast.Block.statements(createId(), []),
        declStmt,
        Ast.Expression.Literal.boolean(createId(), "true"),
        assign,
      );
      expect(forStmt.kind).toBe("statement:control-flow:for");

      const returnStmt = Ast.Statement.ControlFlow.return_(
        createId(),
        Ast.Expression.identifier(createId(), "x"),
      );
      expect(returnStmt.kind).toBe("statement:control-flow:return");

      const breakStmt = Ast.Statement.ControlFlow.break_(createId());
      expect(breakStmt.kind).toBe("statement:control-flow:break");

      const exprStmt = Ast.Statement.express(
        createId(),
        Ast.Expression.identifier(createId(), "x"),
      );
      expect(exprStmt.kind).toBe("statement:express");
    });

    it("should handle source locations", () => {
      const loc = {
        offset: 0,
        length: 5,
      };

      const node = Ast.Expression.identifier(createId(), "test", loc);
      expect(node.loc).toEqual(loc);
    });
  });

  describe("Type Guards", () => {
    it("should identify expressions", () => {
      expect(Ast.isExpression(Ast.Expression.identifier(createId(), "x"))).toBe(
        true,
      );
      expect(
        Ast.isExpression(Ast.Expression.Literal.number(createId(), "42")),
      ).toBe(true);
      expect(
        Ast.isExpression(
          Ast.Expression.operator(createId(), "+", [
            Ast.Expression.Literal.number(createId(), "1"),
            Ast.Expression.Literal.number(createId(), "2"),
          ]),
        ),
      ).toBe(true);
      expect(
        Ast.isExpression(
          Ast.Expression.Access.member(
            createId(),
            Ast.Expression.identifier(createId(), "x"),
            "y",
          ),
        ),
      ).toBe(true);
      expect(
        Ast.isExpression(
          Ast.Expression.call(
            createId(),
            Ast.Expression.identifier(createId(), "f"),
            [],
          ),
        ),
      ).toBe(true);
      expect(
        Ast.isExpression(Ast.Expression.Special.msgSender(createId())),
      ).toBe(true);

      expect(Ast.isExpression(Ast.Block.statements(createId(), []))).toBe(
        false,
      );
      expect(Ast.isExpression(Ast.Type.Elementary.uint(createId(), 256))).toBe(
        false,
      );
    });

    it("should identify statements", () => {
      expect(
        Ast.isStatement(
          Ast.Statement.declare(
            createId(),
            Ast.Declaration.variable(createId(), "x"),
          ),
        ),
      ).toBe(true);
      expect(
        Ast.isStatement(
          Ast.Statement.assign(
            createId(),
            Ast.Expression.identifier(createId(), "x"),
            Ast.Expression.Literal.number(createId(), "1"),
          ),
        ),
      ).toBe(true);
      expect(
        Ast.isStatement(
          Ast.Statement.ControlFlow.if_(
            createId(),
            Ast.Expression.Literal.boolean(createId(), "true"),
            Ast.Block.statements(createId(), []),
          ),
        ),
      ).toBe(true);
      expect(
        Ast.isStatement(
          Ast.Statement.express(
            createId(),
            Ast.Expression.identifier(createId(), "x"),
          ),
        ),
      ).toBe(true);

      expect(Ast.isStatement(Ast.Expression.identifier(createId(), "x"))).toBe(
        false,
      );
      expect(Ast.isStatement(Ast.Block.statements(createId(), []))).toBe(false);
    });

    it("should identify type nodes", () => {
      expect(Ast.isType(Ast.Type.Elementary.uint(createId(), 256))).toBe(true);
      expect(
        Ast.isType(
          Ast.Type.Complex.array(
            createId(),
            Ast.Type.Elementary.uint(createId(), 256),
          ),
        ),
      ).toBe(true);
      expect(Ast.isType(Ast.Type.reference(createId(), "Point"))).toBe(true);

      expect(Ast.isType(Ast.Expression.identifier(createId(), "x"))).toBe(
        false,
      );
      expect(Ast.isType(Ast.Block.statements(createId(), []))).toBe(false);
    });

    it("should identify assignable expressions", () => {
      expect(
        Ast.Expression.isAssignable(Ast.Expression.identifier(createId(), "x")),
      ).toBe(true);
      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.Access.member(
            createId(),
            Ast.Expression.identifier(createId(), "x"),
            "y",
          ),
        ),
      ).toBe(true);
      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.Access.index(
            createId(),
            Ast.Expression.identifier(createId(), "x"),
            Ast.Expression.Literal.number(createId(), "0"),
          ),
        ),
      ).toBe(true);

      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.Literal.number(createId(), "42"),
        ),
      ).toBe(false);
      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.operator(createId(), "+", [
            Ast.Expression.Literal.number(createId(), "1"),
            Ast.Expression.Literal.number(createId(), "2"),
          ]),
        ),
      ).toBe(false);
      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.call(
            createId(),
            Ast.Expression.identifier(createId(), "f"),
            [],
          ),
        ),
      ).toBe(false);
      expect(
        Ast.Expression.isAssignable(
          Ast.Expression.Special.msgSender(createId()),
        ),
      ).toBe(false);
    });
  });

  describe("Utility Functions", () => {
    describe("cloneNode", () => {
      it("should deep clone nodes", () => {
        const original = Ast.Expression.operator(createId(), "+", [
          Ast.Expression.identifier(createId(), "x"),
          Ast.Expression.Literal.number(createId(), "42"),
        ]);
        const clone = Ast.Node.clone(original);

        expect(clone).not.toBe(original);
        expect(clone.operands[0]).not.toBe(original.operands[0]);
        expect(clone.operands[1]).not.toBe(original.operands[1]);
        expect(clone).toEqual(original);
      });

      it("should handle complex nested structures", () => {
        const program = Ast.program(
          createId(),
          "Test",
          undefined,
          Ast.Block.definitions(createId(), [
            Ast.Declaration.struct(createId(), "Point", [
              Ast.Declaration.field(
                createId(),
                "x",
                Ast.Type.Elementary.uint(createId(), 256),
              ),
              Ast.Declaration.field(
                createId(),
                "y",
                Ast.Type.Elementary.uint(createId(), 256),
              ),
            ]),
          ]),
          Ast.Block.statements(createId(), [
            Ast.Statement.ControlFlow.if_(
              createId(),
              Ast.Expression.operator(createId(), "==", [
                Ast.Expression.Special.msgSender(createId()),
                Ast.Expression.identifier(createId(), "owner"),
              ]),
              Ast.Block.statements(createId(), [
                Ast.Statement.assign(
                  createId(),
                  Ast.Expression.identifier(createId(), "x"),
                  Ast.Expression.Literal.number(createId(), "42"),
                ),
              ]),
            ),
          ]),
        );

        const clone = Ast.Node.clone(program);
        expect(clone).not.toBe(program);
        expect(clone.definitions).not.toBe(program.definitions);
        expect(clone.body).not.toBe(program.body);
        expect(clone).toEqual(program);
      });
    });

    describe("updateNode", () => {
      it("should create updated copy", () => {
        const original = Ast.Expression.identifier(createId(), "x");
        const updated = Ast.Node.update(original, { name: "y" });

        expect(updated).not.toBe(original);
        expect(updated.name).toBe("y");
        expect(original.name).toBe("x");
      });
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle realistic program structure", () => {
      const program = Ast.program(
        createId(),
        "SimpleStorage",
        [
          // storage { 0: owner: address; 1: users: mapping<address, User>; }
          Ast.Declaration.storage(
            createId(),
            "owner",
            Ast.Type.Elementary.address(createId()),
            0,
          ),
          Ast.Declaration.storage(
            createId(),
            "users",
            Ast.Type.Complex.mapping(
              createId(),
              Ast.Type.Elementary.address(createId()),
              Ast.Type.reference(createId(), "User"),
            ),
            1,
          ),
        ],
        Ast.Block.definitions(createId(), [
          // struct User { name: string; balance: uint256; }
          Ast.Declaration.struct(createId(), "User", [
            Ast.Declaration.field(
              createId(),
              "name",
              Ast.Type.Elementary.string(createId()),
            ),
            Ast.Declaration.field(
              createId(),
              "balance",
              Ast.Type.Elementary.uint(createId(), 256),
            ),
          ]),
        ]),
        Ast.Block.statements(createId(), [
          // let sender = msg.sender;
          Ast.Statement.declare(
            createId(),
            Ast.Declaration.variable(
              createId(),
              "sender",
              undefined,
              Ast.Expression.Special.msgSender(createId()),
            ),
          ),

          // if (sender == owner) { users[sender].balance = users[sender].balance + msg.value; }
          Ast.Statement.ControlFlow.if_(
            createId(),
            Ast.Expression.operator(createId(), "==", [
              Ast.Expression.identifier(createId(), "sender"),
              Ast.Expression.identifier(createId(), "owner"),
            ]),
            Ast.Block.statements(createId(), [
              Ast.Statement.assign(
                createId(),
                Ast.Expression.Access.member(
                  createId(),
                  Ast.Expression.Access.index(
                    createId(),
                    Ast.Expression.identifier(createId(), "users"),
                    Ast.Expression.identifier(createId(), "sender"),
                  ),
                  "balance",
                ),
                Ast.Expression.operator(createId(), "+", [
                  Ast.Expression.Access.member(
                    createId(),
                    Ast.Expression.Access.index(
                      createId(),
                      Ast.Expression.identifier(createId(), "users"),
                      Ast.Expression.identifier(createId(), "sender"),
                    ),
                    "balance",
                  ),
                  Ast.Expression.Special.msgValue(createId()),
                ]),
              ),
            ]),
          ),
        ]),
        Ast.Block.statements(createId(), []),
      );

      expect(program.kind).toBe("program");
      expect(program.storage).toHaveLength(2);
      expect(program.definitions?.items).toHaveLength(1);
      expect(program.body?.items).toHaveLength(2);

      // Verify structure
      const structDecl = program.definitions!.items[0];
      expect(structDecl.kind).toBe("declaration:struct");
      expect((structDecl as Ast.Declaration.Struct).fields).toHaveLength(2);

      const ifStmt = program.body?.items[1] as { kind: string };
      expect(ifStmt.kind).toBe("statement:control-flow:if");
    });
  });
});
