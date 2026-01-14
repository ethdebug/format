import { describe, it, expect } from "vitest";
import "#test/matchers";
import * as Ast from "#ast";
import { Severity } from "#result";
import { parse } from "./parser.js";

describe("Normalized Parser", () => {
  describe("Basic Parsing", () => {
    it("should parse minimal program", () => {
      const input = `
        name Test;
        storage {}
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      expect(result.kind).toBe("program");
      expect(result.name).toBe("Test");
      expect(result.storage ?? []).toEqual([]);
      expect(result.body?.kind).toBe("block:statements");
      expect(result.body?.items).toEqual([]);
    });

    it("should include source locations", () => {
      const input = `name Test;
storage {}
code {}`;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      expect(result.loc).not.toBeNull();
      expect(result.loc?.offset).toBe(0);
      expect(result.loc?.length).toBe(input.length);
    });

    it("should parse program without storage block", () => {
      const input = `
        name NoStorage;
        code {
          let x = 10;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      expect(result.kind).toBe("program");
      expect(result.name).toBe("NoStorage");
      expect(result.storage ?? []).toEqual([]);
      expect(result.body?.items).toHaveLength(1);
    });
  });

  describe("Type Parsing", () => {
    it("should parse primitive types", () => {
      const input = `
        name Test;
        storage {
          [0] balance: uint256;
          [1] owner: address;
          [2] flag: bool;
        }
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const [balance, owner, flag] =
        result.storage as Ast.Declaration.Storage[];

      expect(balance.type.kind).toBe("type:elementary:uint");
      const balanceType = balance.type as Ast.Type.Elementary.Uint;
      expect(balanceType.kind).toBe("type:elementary:uint");
      expect(balanceType.bits).toBe(256);

      const ownerType = owner.type as Ast.Type.Elementary.Address;
      expect(ownerType.kind).toBe("type:elementary:address");

      const flagType = flag.type as Ast.Type.Elementary.Bool;
      expect(flagType.kind).toBe("type:elementary:bool");
    });

    it("should parse array types", () => {
      const input = `
        name Test;
        storage {
          [0] nums: array<uint256>;
          [1] fixed: array<uint256, 10>;
        }
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const [nums, fixed] = result.storage as Ast.Declaration.Storage[];

      expect(nums.type.kind).toBe("type:complex:array");
      const numsType = nums.type as Ast.Type.Complex.Array;
      expect(numsType.kind).toBe("type:complex:array");
      expect(numsType.size).toBeUndefined();
      expect(numsType.element).toBeDefined();

      const fixedType = fixed.type as Ast.Type.Complex.Array;
      expect(fixedType.kind).toBe("type:complex:array");
      expect(fixedType.size).toBe(10);
    });

    it("should parse mapping types", () => {
      const input = `
        name Test;
        storage {
          [0] balances: mapping<address, uint256>;
        }
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const mapping = result.storage![0] as Ast.Declaration.Storage;

      const mapType = mapping.type as Ast.Type.Complex.Mapping;
      expect(mapType.kind).toBe("type:complex:mapping");
      expect(mapType.key).toBeDefined();
      expect(mapType.value).toBeDefined();

      const keyType = mapType.key as Ast.Type.Elementary.Address;
      expect(keyType.kind).toBe("type:elementary:address");

      const valueType = mapType.value as Ast.Type.Elementary.Uint;
      expect(valueType.kind).toBe("type:elementary:uint");
      expect(valueType.bits).toBe(256);
    });

    it("should parse reference types", () => {
      const input = `
        name Test;
        define {
          struct Point { x: uint256; y: uint256; };
        }
        storage {
          [0] position: Point;
        }
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const position = result.storage?.find(
        (d: Ast.Declaration.Storage) => d.name === "position",
      ) as Ast.Declaration.Storage;

      expect(position?.type.kind).toBe("type:reference");
      expect((position?.type as Ast.Type.Reference).name).toBe("Point");
    });
  });

  describe("Declaration Parsing", () => {
    it("should parse struct declarations", () => {
      const input = `
        name Test;
        define {
          struct Point {
            x: uint256;
            y: uint256;
          };
        }
        storage {}
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const struct = result.definitions?.items[0];

      expect(struct?.kind).toBe("declaration:struct");
      expect(struct?.name).toBe("Point");
      const structDecl = struct as Ast.Declaration.Struct;
      expect(structDecl.fields).toHaveLength(2);

      const [x, y] = structDecl.fields;
      expect(x.kind).toBe("declaration:field");
      expect(x.name).toBe("x");
      expect(y.name).toBe("y");
    });

    it("should parse storage declarations", () => {
      const input = `
        name Test;
        storage {
          [0] balance: uint256;
          [42] data: bytes32;
        }
        code {}
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const [balance, data] = result.storage as Ast.Declaration.Storage[];

      expect(balance.kind).toBe("declaration:storage");
      expect(balance.slot).toBe(0);
      expect(data.slot).toBe(42);
    });

    it("should parse variable declarations", () => {
      const input = `
        name Test;
        storage {}
        code {
          let x = 42;
          let flag = true;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const [letX, letFlag] = result.body?.items as Ast.Statement.Declare[];

      expect(letX.kind).toBe("statement:declare");
      expect(letX.declaration.kind).toBe("declaration:variable");
      expect(letX.declaration.name).toBe("x");

      const xDecl = letX.declaration as Ast.Declaration.Variable;
      const xInit = xDecl.initializer as Ast.Expression.Literal;
      expect(xInit.kind).toBe("expression:literal:number");
      expect(xInit.value).toBe("42");

      const flagDecl = letFlag.declaration as Ast.Declaration.Variable;
      const flagInit = flagDecl.initializer as Ast.Expression.Literal;
      expect(flagInit.kind).toBe("expression:literal:boolean");
      expect(flagInit.value).toBe("true");
    });
  });

  describe("Expression Parsing", () => {
    it("should parse literal expressions", () => {
      const input = `
        name Test;
        storage {}
        code {
          42;
          0x1234;
          "hello";
          true;
          false;
          0x1234567890123456789012345678901234567890;
          100 ether;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];
      const exprs = stmts.map((s) => s.expression as Ast.Expression.Literal);

      expect(exprs[0].kind).toBe("expression:literal:number");
      expect(exprs[0].value).toBe("42");

      expect(exprs[1].kind).toBe("expression:literal:hex");
      expect(exprs[1].value).toBe("0x1234");

      expect(exprs[2].kind).toBe("expression:literal:string");
      expect(exprs[2].value).toBe("hello");

      expect(exprs[3].kind).toBe("expression:literal:boolean");
      expect(exprs[3].value).toBe("true");

      expect(exprs[4].kind).toBe("expression:literal:boolean");
      expect(exprs[4].value).toBe("false");

      expect(exprs[5].kind).toBe("expression:literal:address");
      expect(exprs[5].value).toBe("0x1234567890123456789012345678901234567890");

      expect(exprs[6].kind).toBe("expression:literal:number");
      expect(exprs[6].value).toBe("100");
      expect((exprs[6] as Ast.Expression.Literal.Number).unit).toBe("ether");
    });

    it("should parse identifier expressions", () => {
      const input = `
        name Test;
        storage {}
        code {
          x;
          balance;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];
      const [x, balance] = stmts.map(
        (s) => s.expression as Ast.Expression.Identifier,
      );

      expect(x.kind).toBe("expression:identifier");
      expect(x.name).toBe("x");
      expect(balance.name).toBe("balance");
    });

    it("should parse operator expressions", () => {
      const input = `
        name Test;
        storage {}
        code {
          x + y;
          a * b;
          !flag;
          -value;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];
      const exprs = stmts.map((s) => s.expression as Ast.Expression.Operator);

      expect(exprs[0].operator).toBe("+");
      expect(exprs[0].operands).toHaveLength(2);

      expect(exprs[1].operator).toBe("*");

      expect(exprs[2].operator).toBe("!");
      expect(exprs[2].operands).toHaveLength(1);

      expect(exprs[3].operator).toBe("-");
      expect(exprs[3].operands).toHaveLength(1);
    });

    it("should parse access expressions", () => {
      const input = `
        name Test;
        storage {}
        code {
          point.x;
          arr[0];
          nested.field.subfield;
          matrix[i][j];
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];
      const exprs = stmts.map((s) => s.expression as Ast.Expression.Access);

      if (!Ast.Expression.Access.isMember(exprs[0])) {
        throw new Error("Expected member access");
      }
      expect(exprs[0].property).toBe("x");

      if (!Ast.Expression.Access.isIndex(exprs[1])) {
        throw new Error("Expected index access");
      }
      if (!Ast.Expression.isLiteral(exprs[1].index)) {
        throw new Error("Expected literal in index");
      }
      expect(exprs[1].index.value).toBe("0");

      // nested.field.subfield is two member accesses
      const nested = exprs[2];
      if (!Ast.Expression.Access.isMember(nested)) {
        throw new Error("Expected member access");
      }
      expect(nested.property).toBe("subfield");

      const nestedObj = nested.object;
      if (
        !Ast.Expression.isAccess(nestedObj) ||
        !Ast.Expression.Access.isMember(nestedObj)
      ) {
        throw new Error("expected member access");
      }
      expect(nestedObj.kind).toBe("expression:access:member");
      expect(nestedObj.property).toBe("field");

      // matrix[i][j] is two index accesses
      const matrix = exprs[3];
      expect(matrix.kind).toBe("expression:access:index");
    });

    it("should parse special expressions", () => {
      const input = `
        name Test;
        storage {}
        code {
          msg.sender;
          msg.value;
          msg.data;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];
      const [sender, value, data] = stmts.map(
        (s) => s.expression as Ast.Expression.Special,
      );

      expect(sender.kind).toBe("expression:special:msg.sender");

      expect(value.kind).toBe("expression:special:msg.value");

      expect(data.kind).toBe("expression:special:msg.data");
    });

    it("should parse complex expressions with correct precedence", () => {
      const input = `
        name Test;
        storage {}
        code {
          a + b * c;
          x == y && z != w;
          !flag || value > 0;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Express[];

      // a + b * c should be a + (b * c)
      const expr1 = stmts[0].expression as Ast.Expression.Operator;
      expect(expr1.operator).toBe("+");
      const right1 = expr1.operands[1] as Ast.Expression.Operator;
      expect(right1.operator).toBe("*");

      // x == y && z != w should be (x == y) && (z != w)
      const expr2 = stmts[1].expression as Ast.Expression.Operator;
      expect(expr2.operator).toBe("&&");
      const left2 = expr2.operands[0] as Ast.Expression.Operator;
      expect(left2.operator).toBe("==");
      const right2 = expr2.operands[1] as Ast.Expression.Operator;
      expect(right2.operator).toBe("!=");
    });
  });

  describe("Statement Parsing", () => {
    it("should parse assignment statements", () => {
      const input = `
        name Test;
        storage {}
        code {
          x = 42;
          point.x = 100;
          arr[0] = value;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.Assign[];

      expect(stmts[0].kind).toBe("statement:assign");
      expect((stmts[0].target as Ast.Expression.Identifier).name).toBe("x");
      expect((stmts[0].value as Ast.Expression.Literal).value).toBe("42");

      expect((stmts[1].target as Ast.Expression.Access).kind).toBe(
        "expression:access:member",
      );
      expect((stmts[2].target as Ast.Expression.Access).kind).toBe(
        "expression:access:index",
      );
    });

    it("should parse control flow statements", () => {
      const input = `
        name Test;
        storage {}
        code {
          if (x > 0) {
            return x;
          }

          if (flag) {
            break;
          } else {
            return 0;
          }

          for (let i = 0; i < 10; i = i + 1) {
            x = x + i;
          }
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const [if1, if2, forLoop] = result.body
        ?.items as Ast.Statement.ControlFlow[];

      expect(if1.kind).toBe("statement:control-flow:if");
      const if1Cast = if1 as Ast.Statement.ControlFlow.If;
      expect(if1Cast.condition).toBeDefined();
      expect(if1Cast.body.items).toHaveLength(1);
      expect(if1Cast.alternate).toBeUndefined();

      expect(if2.kind).toBe("statement:control-flow:if");
      const if2Cast = if2 as Ast.Statement.ControlFlow.If;
      expect(if2Cast.body.items[0].kind).toBe("statement:control-flow:break");
      expect(if2Cast.alternate).toBeDefined();

      expect(forLoop.kind).toBe("statement:control-flow:for");
      const forLoopCast = forLoop as Ast.Statement.ControlFlow.For;
      expect(forLoopCast.init?.kind).toBe("statement:declare");
      expect(forLoopCast.condition).toBeDefined();
      expect(forLoopCast.update?.kind).toBe("statement:assign");
      expect(forLoopCast.body.items).toHaveLength(1);
    });

    it("should parse return statements", () => {
      const input = `
        name Test;
        storage {}
        code {
          return;
          return 42;
          return x + y;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;
      const stmts = result.body?.items as Ast.Statement.ControlFlow[];

      expect(stmts[0].kind).toBe("statement:control-flow:return");
      expect(
        (stmts[0] as Ast.Statement.ControlFlow.Return).value,
      ).toBeUndefined();

      expect(stmts[1].kind).toBe("statement:control-flow:return");
      expect(
        (
          (stmts[1] as Ast.Statement.ControlFlow.Return)
            .value as Ast.Expression.Literal
        ).value,
      ).toBe("42");

      expect(stmts[2].kind).toBe("statement:control-flow:return");
      expect(
        (
          (stmts[2] as Ast.Statement.ControlFlow.Return)
            .value as Ast.Expression.Operator
        ).operator,
      ).toBe("+");
    });
  });

  describe("Complex Programs", () => {
    it("should parse complete program", () => {
      const input = `
        name SimpleStorage;

        define {
          struct User {
            username: string;
            balance: uint256;
          };
        }

        storage {
          [0] owner: address;
          [1] users: mapping<address, User>;
          [2] totalSupply: uint256;
        }

        code {
          let sender = msg.sender;

          if (sender == owner) {
            users[sender].balance = users[sender].balance + msg.value;
            totalSupply = totalSupply + msg.value;
          } else {
            return 0;
          }

          return users[sender].balance;
        }
      `;

      const parseResult = parse(input);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const result = parseResult.value;

      expect(result.name).toBe("SimpleStorage");
      expect(result.storage ?? []).toHaveLength(3); // 3 storage
      expect(result.definitions?.items ?? []).toHaveLength(1); // 1 struct

      const struct = result.definitions?.items[0];
      expect(struct?.kind).toBe("declaration:struct");
      expect((struct as Ast.Declaration.Struct).fields).toHaveLength(2);

      const codeStmts = result.body?.items;
      expect(codeStmts).toHaveLength(3); // let, if, return

      const ifStmt = codeStmts?.[1] as Ast.Statement.ControlFlow.If;
      expect(ifStmt.body.items).toHaveLength(2); // two assignments
      expect(ifStmt.alternate?.items).toHaveLength(1); // one return
    });
  });

  describe("Error Handling", () => {
    it("should handle parse errors gracefully", () => {
      const result = parse("invalid syntax");
      expect(result.success).toBe(false);
    });

    it("should provide helpful error messages", () => {
      const result = parse(`
        name Test;
        storage {
          0: x uint256;
        }
        code {}
      `);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Error occurs at column 11 where parser expects "[" for storage slot syntax
        expect(result).toHaveMessage({
          severity: Severity.Error,
          message: "Parse error at line 4, column 11",
        });
      }
    });
  });
});
