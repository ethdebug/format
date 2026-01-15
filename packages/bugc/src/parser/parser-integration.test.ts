import { describe, it, expect } from "vitest";

import type * as Ast from "#ast";

import { parse } from "./parser.js";

describe("Parser Integration Tests", () => {
  describe("Complete Example Programs", () => {
    it("should parse counter.bug example", () => {
      const source = `
name Counter;

storage {
  [0] count: uint256;
  [1] owner: address;
}

code {
  if (msg.sender != owner) {
    return;
  }
  count = count + 1;
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.kind).toBe("program");
      expect(ast.name).toBe("Counter");
      expect(ast.storage).toHaveLength(2);
      expect(ast.body?.items).toHaveLength(2);

      const ifStmt = ast.body?.items[0] as Ast.Statement.ControlFlow;
      expect(ifStmt.kind).toBe("statement:control-flow:if");
    });

    it("should parse simple-storage.bug example", () => {
      const source = `
name SimpleStorage;

define {
  struct User {
    id: uint256;
    balance: uint256;
    active: bool;
  };
}

storage {
  [0] users: mapping<address, User>;
  [1] totalUsers: uint256;
  [2] admin: address;
}

code {
  let sender = msg.sender;

  if (sender == admin) {
    let user = users[sender];
    user.balance = user.balance + msg.value;
    totalUsers = totalUsers + 1;
  }
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.kind).toBe("program");
      expect(ast.name).toBe("SimpleStorage");
      expect(ast.storage ?? []).toHaveLength(3); // 3 storage
      expect(ast.definitions?.items ?? []).toHaveLength(1); // 1 struct

      const struct = ast.definitions?.items[0];
      expect(struct?.kind).toBe("declaration:struct");
      expect(struct?.name).toBe("User");
      expect((struct as Ast.Declaration.Struct).fields).toHaveLength(3);
    });

    it("should parse auction.bug example", () => {
      const source = `
name Auction;

define {
  struct Bid {
    bidder: address;
    amount: uint256;
    timestamp: uint256;
  };
}

storage {
  [0] highestBid: Bid;
  [1] beneficiary: address;
  [2] endTime: uint256;
  [3] ended: bool;
}

code {
  if (ended) {
    return 0;
  }

  let bid = highestBid;
  if (msg.value > bid.amount) {
    highestBid.bidder = msg.sender;
    highestBid.amount = msg.value;
    return 1;
  }

  return 0;
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.kind).toBe("program");
      expect(ast.storage ?? []).toHaveLength(4); // 4 storage
      expect(ast.definitions?.items ?? []).toHaveLength(1); // 1 struct
      expect(ast.body?.items).toHaveLength(4); // if, let, if, return
    });
  });

  describe("Complex Expression Parsing", () => {
    it("should parse nested mappings", () => {
      const source = `
name NestedMappings;

storage {
  [0] balances: mapping<address, mapping<uint256, uint256>>;
}

code {
  let addr = 0x1234567890123456789012345678901234567890;
  let tokenId = 42;
  let balance = balances[addr][tokenId];
  balances[addr][tokenId] = balance + 1;
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.storage ?? []).toHaveLength(1);

      const balances = ast.storage![0] as Ast.Declaration.Storage;
      expect(balances.type.kind.startsWith("type:complex:")).toBe(true);
    });

    it("should parse complex arithmetic expressions", () => {
      const source = `
name ComplexMath;

storage {
  [0] result: uint256;
}

code {
  let a = 10;
  let b = 20;
  let c = 30;

  result = a + b * c - (a + b) / c;
  result = ((a + b) * c + a * (b + c)) / (a + b + c);
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.body?.items).toHaveLength(5);
    });
  });

  it.skip("should parse with error recovery enabled", () => {
    const source = `
name ErrorRecovery;

storage {
  [0] x: uint256  // Missing semicolon
  [1] y: uint256;
}

code {
  let a = 10
  let b = 20;  // Should recover from previous error
  x = a + b;
}
`;

    const result = parse(source);
    expect(result.success).toBe(false);
    // Would check for multiple errors if error recovery was implemented
  });

  describe("Edge Cases", () => {
    it("should parse empty program", () => {
      const source = `
name Empty;
storage {}
code {}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.name).toBe("Empty");
      expect(ast.storage ?? []).toEqual([]);
      expect(ast.body?.items).toEqual([]);
    });

    it("should parse program with only storage", () => {
      const source = `
name StorageOnly;

storage {
  [0] x: uint256;
  [1] y: address;
}

code {}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      expect(ast.storage ?? []).toHaveLength(2);
      expect(ast.body?.items).toEqual([]);
    });

    it("should parse program with complex control flow", () => {
      const source = `
name ControlFlow;

storage {
  [0] counter: uint256;
}

code {
  for (let i = 0; i < 10; i = i + 1) {
    if (i > 5) {
      break;
    }
    counter = counter + i;
  }

  if (counter > 15) {
    return 1;
  } else {
    return 0;
  }
}
`;

      const parseResult = parse(source);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) throw new Error("Parse failed");
      const ast = parseResult.value;
      const forLoop = ast.body?.items[0] as Ast.Statement.ControlFlow;
      expect(forLoop.kind).toBe("statement:control-flow:for");
      expect(
        (forLoop as Ast.Statement.ControlFlow.For).body.items,
      ).toHaveLength(2);
    });
  });
});
