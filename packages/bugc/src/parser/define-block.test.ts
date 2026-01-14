import { describe, it, expect } from "vitest";
import * as Ast from "#ast";
import { Severity } from "#result";
import { parse } from "./parser.js";
import "#test/matchers";

describe("Define Block Parser", () => {
  describe("Basic define block parsing", () => {
    it("should parse empty define block", () => {
      const input = `
        name EmptyDefine;

        define {
        }

        storage {
        }

        code {
        }
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      expect(result.value.definitions?.items ?? []).toHaveLength(0);
    });

    it("should parse define block with single struct", () => {
      const input = `
        name SingleStruct;

        define {
          struct User {
            addr: address;
            balance: uint256;
          };
        }

        storage {
          [0] owner: User;
        }

        code {
        }
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      // Should have 1 struct from define block, and 1 storage declaration
      expect(result.value.definitions?.items ?? []).toHaveLength(1);
      expect(result.value.storage ?? []).toHaveLength(1);

      const structDecl = result.value.definitions!.items[0];
      if (!Ast.Declaration.isStruct(structDecl)) {
        throw new Error("Should receive a struct declaration");
      }
      expect(structDecl.kind).toBe("declaration:struct");
      expect(structDecl.name).toBe("User");
      expect(structDecl.fields).toHaveLength(2);

      const storageDecl = result.value.storage![0];
      expect(storageDecl.kind).toBe("declaration:storage");
      expect(storageDecl.name).toBe("owner");
    });

    it("should parse define block with multiple structs", () => {
      const input = `
        name MultipleStructs;

        define {
          struct User {
            addr: address;
            balance: uint256;
          };

          struct Transaction {
            from: address;
            to: address;
            amount: uint256;
          };
        }

        storage {
          [0] owner: User;
          [1] lastTx: Transaction;
        }

        code {
        }
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      // Should have 2 structs from define block, and 2 storage declarations
      expect(result.value.definitions?.items ?? []).toHaveLength(2);
      expect(result.value.storage ?? []).toHaveLength(2);

      const userStruct = result.value.definitions!.items[0];
      expect(userStruct.kind).toBe("declaration:struct");
      expect(userStruct.name).toBe("User");

      const txStruct = result.value.definitions!.items[1];
      expect(txStruct.kind).toBe("declaration:struct");
      expect(txStruct.name).toBe("Transaction");
    });

    it("should work without define block", () => {
      const input = `
        name NoDefineBlock;

        storage {
          [0] count: uint256;
        }

        code {
          count = count + 1;
        }
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      // Should only have storage declaration, no definitions
      expect(result.value.definitions?.items ?? []).toHaveLength(0);
      expect(result.value.storage ?? []).toHaveLength(1);
      expect(result.value.storage![0].kind).toBe("declaration:storage");
    });
  });

  describe("Syntax requirements", () => {
    it("should require semicolons after struct declarations in define block", () => {
      const input = `
        name MissingSemicolon;

        define {
          struct User {
            addr: address;
            balance: uint256;
          }
          struct Transaction {
            from: address;
          };
        }

        storage {}
        code {}
      `;

      const result = parse(input);
      expect(result.success).toBe(false);
    });

    it("should reject struct declarations outside define block", () => {
      const input = `
        name StructOutsideDefine;

        struct User {
          addr: address;
        }

        define {
        }

        storage {}
        code {}
      `;

      const result = parse(input);
      expect(result.success).toBe(false);
    });

    it("should reject define keyword as identifier", () => {
      const input = `
        name DefineAsIdentifier;

        storage {
          [0] define: uint256;
        }

        code {}
      `;

      const result = parse(input);
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Parse should have failed");

      expect(result).toHaveMessage({
        severity: Severity.Error,
        message: "Cannot use keyword 'define' as identifier",
      });
    });
  });

  describe("Complex scenarios", () => {
    it("should parse nested struct references in define block", () => {
      const input = `
        name NestedStructs;

        define {
          struct Point {
            x: uint256;
            y: uint256;
          };

          struct Shape {
            center: Point;
            radius: uint256;
          };
        }

        storage {
          [0] circle: Shape;
        }

        code {
          circle.center.x = 100;
          circle.center.y = 200;
          circle.radius = 50;
        }
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      expect(result.value.definitions?.items ?? []).toHaveLength(2); // 2 structs from define
      expect(result.value.storage ?? []).toHaveLength(1); // 1 storage
    });

    it("should parse define block with empty structs", () => {
      const input = `
        name EmptyStructs;

        define {
          struct Empty {
          };

          struct AlsoEmpty {
          };
        }

        storage {}
        code {}
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      const declarations = result.value.definitions?.items ?? [];

      expect(declarations).toHaveLength(2);
      if (!declarations.every(Ast.Declaration.isStruct)) {
        throw new Error("Expected only struct declarations");
      }

      expect(declarations[0].fields).toHaveLength(0);
      expect(declarations[1].fields).toHaveLength(0);
    });

    it("should handle define block with comments", () => {
      const input = `
        name DefineWithComments;

        define {
          // User account structure
          struct User {
            addr: address;    // account address
            balance: uint256; // balance in wei
          };

          /* Transaction record */
          struct Transaction {
            from: address;
            to: address;
            amount: uint256;
          };
        }

        storage {}
        code {}
      `;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      expect(result.value.definitions?.items ?? []).toHaveLength(2);
    });
  });

  describe("Source locations", () => {
    it("should track source locations for define block", () => {
      const input = `name DefineLocation;

define {
  struct User {
    addr: address;
  };
}

storage {}
code {}`;

      const result = parse(input);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Parse failed");

      const structDecl = result.value.definitions!.items[0];
      expect(structDecl.loc).not.toBeNull();
      expect(structDecl.loc?.offset).toBeGreaterThan(0);
      expect(structDecl.loc?.length).toBeGreaterThan(0);
    });
  });
});
