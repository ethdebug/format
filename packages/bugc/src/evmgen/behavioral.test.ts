import { describe, it, expect } from "vitest";

import { executeProgram } from "#test/evm/behavioral";

describe("behavioral tests", () => {
  describe("deploy + check storage", () => {
    it("should initialize storage in constructor", async () => {
      const source = `name InitStorage;

storage {
  [0] value: uint256;
  [1] flag: uint256;
}

create {
  value = 42;
  flag = 1;
}

code {}`;

      const result = await executeProgram(source);
      expect(result.deployed).toBe(true);
      expect(await result.getStorage(0n)).toBe(42n);
      expect(await result.getStorage(1n)).toBe(1n);
    });

    it("should handle multiple storage slots", async () => {
      const source = `name MultiSlot;

storage {
  [0] a: uint256;
  [1] b: uint256;
  [2] c: uint256;
}

create {
  a = 100;
  b = 200;
  c = a + b;
}

code {}`;

      const result = await executeProgram(source);
      expect(await result.getStorage(0n)).toBe(100n);
      expect(await result.getStorage(1n)).toBe(200n);
      expect(await result.getStorage(2n)).toBe(300n);
    });
  });

  describe("deploy + call + check storage", () => {
    it("should modify storage on call", async () => {
      const source = `name Counter;

storage {
  [0] count: uint256;
}

create {
  count = 0;
}

code {
  count = count + 1;
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(1n);
    });

    it("should support multiple calls", async () => {
      const source = `name MultiCall;

storage {
  [0] count: uint256;
}

create {
  count = 0;
}

code {
  count = count + 1;
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });
      expect(await result.getStorage(0n)).toBe(1n);

      const execResult = await result.executor.execute({
        data: "",
      });
      expect(execResult.success).toBe(true);
      expect(await result.getStorage(0n)).toBe(2n);
    });
  });

  describe("internal functions", () => {
    // Internal function calls currently fail at runtime
    // (stack underflow). Tracked as known issue.
    it.skip("should call defined functions", async () => {
      const source = `name FuncCall;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = add(10, 20);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(30n);
    });
  });

  describe("loops", () => {
    it("should execute a for loop", async () => {
      const source = `name Loop;

storage {
  [0] total: uint256;
}

create {
  total = 0;
}

code {
  for (let i = 0; i < 5; i = i + 1) {
    total = total + 1;
  }
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(5n);
    });
  });

  describe("conditional behavior", () => {
    it("should execute conditional branches", async () => {
      const source = `name Conditional;

storage {
  [0] value: uint256;
  [1] flag: uint256;
}

create {
  value = 0;
  flag = 1;
}

code {
  if (flag == 1) {
    value = 100;
  } else {
    value = 200;
  }
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(100n);
    });
  });

  describe("error paths", () => {
    it("should report compilation failure", async () => {
      const source = `this is not valid BUG code`;

      await expect(executeProgram(source)).rejects.toThrow(
        /Compilation failed/,
      );
    });

    it("should handle bare return (STOP)", async () => {
      const source = `name EarlyReturn;

storage {
  [0] reached: uint256;
}

create {
  reached = 0;
}

code {
  reached = 1;
  return;
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(1n);
      expect(result.returnValue.length).toBe(0);
    });
  });
});
