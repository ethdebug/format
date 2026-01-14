import { describe, it, expect } from "vitest";

import { parse } from "./parser.js";

describe("Optional Storage Block", () => {
  it("should parse program without storage block", () => {
    const input = `
      name NoStorage;

      code {
        let x = 42;
        let y = x + 1;
      }
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.name).toBe("NoStorage");
    expect(result.value.storage ?? []).toHaveLength(0);
    expect(result.value.body?.items).toHaveLength(2);
  });

  it("should parse program with define but no storage", () => {
    const input = `
      name DefineNoStorage;

      define {
        struct Point {
          x: uint256;
          y: uint256;
        };
      }

      code {
        let p = 100;
      }
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.storage ?? []).toHaveLength(0);
    expect(result.value.definitions!.items[0].kind).toBe("declaration:struct");
    expect(result.value.definitions!.items[0].name).toBe("Point");
  });

  it("should still parse program with storage block", () => {
    const input = `
      name WithStorage;

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

    expect(result.value.storage ?? []).toHaveLength(1);
    expect(result.value.storage![0].kind).toBe("declaration:storage");
  });

  it("should parse empty storage block", () => {
    const input = `
      name EmptyStorage;

      storage {
      }

      code {
      }
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.storage ?? []).toHaveLength(0);
  });

  it("should parse minimal program without storage", () => {
    const input = `
      name Minimal;
      code {}
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.name).toBe("Minimal");
    expect(result.value.storage ?? []).toHaveLength(0);
    expect(result.value.body?.items).toHaveLength(0);
  });

  it("should parse program with all optional blocks", () => {
    const input = `
      name AllOptional;

      define {
        struct User {
          id: uint256;
        };
      }

      storage {
        [0] owner: User;
      }

      code {
        owner.id = 1;
      }
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.storage ?? []).toHaveLength(1);
    expect(result.value.definitions!.items).toHaveLength(1);
    expect(result.value.definitions!.items[0].kind).toBe("declaration:struct");
  });

  it("should handle whitespace and comments correctly", () => {
    const input = `
      // Program without storage
      name NoStorageWithComments;

      /* No storage block needed
         for this simple program */

      code {
        // Just some calculations
        let result = 1 + 2 + 3;
      }
    `;

    const result = parse(input);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Parse failed");

    expect(result.value.storage ?? []).toHaveLength(0);
  });
});
