import { describe, it, expect } from "vitest";
import { Severity } from "#result";
import { parse } from "./parser.js";
import "#test/matchers";

describe("Create block parsing", () => {
  it("parses program with create block", () => {
    const code = `
      name TokenContract;

      storage {
        [0] totalSupply: uint256;
        [1] owner: address;
      }

      create {
        totalSupply = 1000000;
        owner = msg.sender;
      }

      code {
        let balance = totalSupply;
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ast = result.value;
    expect(ast.name).toBe("TokenContract");
    expect(ast.create).toBeDefined();
    expect(ast.create?.kind).toBe("block:statements");
    expect(ast.create?.items).toHaveLength(2);
    expect(ast.body?.kind).toBe("block:statements");
    expect(ast.body?.items).toHaveLength(1);
  });

  it("parses program without create block", () => {
    const code = `
      name SimpleProgram;

      code {
        let x = 100;
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ast = result.value;
    expect(ast.name).toBe("SimpleProgram");
    expect(ast.create).toBeUndefined();
    expect(ast.body?.kind).toBe("block:statements");
    expect(ast.body?.items).toHaveLength(1);
  });

  it("parses create block with various statements", () => {
    const code = `
      name ComplexContract;

      define {
        struct Config {
          maxSupply: uint256;
          paused: bool;
        };
      }

      storage {
        [0] config: Config;
        [1] balances: mapping<address, uint256>;
      }

      create {
        // Initialize configuration
        config.maxSupply = 1000000;
        config.paused = false;

        // Give creator initial balance
        balances[msg.sender] = 1000;

        // Conditional initialization
        if (msg.value > 0) {
          balances[msg.sender] = balances[msg.sender] + msg.value;
        }
      }

      code {
        // Runtime code
        let currentSupply = config.maxSupply;
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ast = result.value;
    expect(ast.create).toBeDefined();
    expect(ast.create?.items).toHaveLength(4); // 2 config assignments + 1 balance assignment + 1 if statement
  });

  it("parses empty create block", () => {
    const code = `
      name EmptyCreate;

      create {
        // No initialization needed
      }

      code {
        let x = 42;
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ast = result.value;
    expect(ast.create).toBeDefined();
    expect(ast.create?.items).toHaveLength(0);
  });

  it("requires create block before code block", () => {
    const code = `
      name WrongOrder;

      code {
        let x = 42;
      }

      create {
        // This should fail - create must come before code
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(false);
  });

  it("allows create block to use all statement types", () => {
    const code = `
      name FullFeatures;

      storage {
        [0] counter: uint256;
        [1] values: array<uint256, 10>;
      }

      create {
        counter = 0;

        for (let i = 0; i < 10; i = i + 1) {
          values[i] = i * i;
        }

        if (counter == 0) {
          counter = 5;
        }

        if (counter == 5) {
          return;
        }
      }

      code {
        counter = counter + 1;
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ast = result.value;
    expect(ast.create).toBeDefined();
    expect(ast.create?.items).toHaveLength(4); // assignment + for + if + if
  });

  it("disallows 'create' as identifier", () => {
    const code = `
      name BadIdentifier;

      code {
        let create = 100; // Should fail - create is reserved
      }
    `;

    const result = parse(code);
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result).toHaveMessage({
      severity: Severity.Error,
      message: "Cannot use keyword 'create' as identifier",
    });
  });
});
