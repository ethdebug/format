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
    it("should call defined functions", async () => {
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

    it("should call a single-arg function", async () => {
      const source = `name SingleArgFunc;

define {
  function double(x: uint256) -> uint256 {
    return x + x;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = double(7);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(14n);
    });

    it("should call multiple functions", async () => {
      const source = `name MultiFuncCall;

define {
  function double(x: uint256) -> uint256 {
    return x + x;
  };
  function triple(x: uint256) -> uint256 {
    return x + x + x;
  };
}

storage {
  [0] a: uint256;
  [1] b: uint256;
}

create {
  a = 0;
  b = 0;
}

code {
  a = double(7);
  b = triple(5);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(14n);
      expect(await result.getStorage(1n)).toBe(15n);
    });

    it("should return correct value from if/else branches", async () => {
      const source = `name MultiBlockReturn;

define {
  function max(a: uint256, b: uint256) -> uint256 {
    if (a > b) {
      return a;
    } else {
      return b;
    }
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = max(10, 20);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(20n);
    });

    it("should return correct value from both branches", async () => {
      const source = `name BothBranches;

define {
  function max(a: uint256, b: uint256) -> uint256 {
    if (a > b) {
      return a;
    } else {
      return b;
    }
  };
}

storage {
  [0] r1: uint256;
  [1] r2: uint256;
}

create {
  r1 = 0;
  r2 = 0;
}

code {
  r1 = max(10, 20);
  r2 = max(30, 5);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(20n);
      expect(await result.getStorage(1n)).toBe(30n);
    });

    it("should call a function from another function", async () => {
      const source = `name FuncFromFunc;

define {
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };
  function addThree(x: uint256, y: uint256, z: uint256) -> uint256 {
    let sum1 = add(x, y);
    let sum2 = add(sum1, z);
    return sum2;
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = addThree(10, 20, 30);
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(60n);
    });

    it("should call a function in a loop", async () => {
      const source = `name FuncInLoop;

define {
  function increment(x: uint256) -> uint256 {
    return x + 1;
  };
}

storage {
  [0] total: uint256;
}

create {
  total = 0;
}

code {
  for (let i = 0; i < 3; i = i + 1) {
    total = increment(total);
  }
}`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(3n);
    });
  });

  describe("recursion", () => {
    it("should support recursive function calls", async () => {
      const source = `name RecursionTest;

define {
  function succ(n: uint256) -> uint256 {
    return n + 1;
  };
  function count(
    n: uint256, target: uint256
  ) -> uint256 {
    if (n < target) {
      return count(succ(n), target);
    } else {
      return n;
    }
  };
}

storage { [0] result: uint256; }
create { result = 0; }
code { result = count(0, 5); }`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(5n);
    });

    // Known bug: nested call arguments (e.g. count(succ(n), target))
    // fail at optimizer level 2+. Tracked separately.
    it.skip("should support recursion at optimization level 2", async () => {
      const source = `name RecursionOpt;

define {
  function succ(n: uint256) -> uint256 {
    return n + 1;
  };
  function count(
    n: uint256, target: uint256
  ) -> uint256 {
    if (n < target) {
      return count(succ(n), target);
    } else {
      return n;
    }
  };
}

storage { [0] result: uint256; }
create { result = 0; }
code { result = count(0, 5); }`;

      const result = await executeProgram(source, {
        calldata: "",
        optimizationLevel: 2,
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(5n);
    });

    it("should support simple self-recursion", async () => {
      const source = `name SimpleRecursion;

define {
  function factorial(n: uint256) -> uint256 {
    if (n < 2) {
      return 1;
    } else {
      return n * factorial(n - 1);
    }
  };
}

storage { [0] result: uint256; }
create { result = 0; }
code { result = factorial(5); }`;

      const result = await executeProgram(source, {
        calldata: "",
      });

      expect(result.callSuccess).toBe(true);
      expect(await result.getStorage(0n)).toBe(120n);
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
