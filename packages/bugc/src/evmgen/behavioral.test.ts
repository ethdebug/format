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

    // An argument's value must have a home in memory, since the call
    // reloads each argument after it clears the stack. `out` holds the
    // result; the call sends 3 bytes of calldata.
    const argumentKinds = {
      "a cast": [
        `function g(x: uint8) -> uint256 { return x as uint256; };`,
        `out = g((n + 5) as uint8);`,
        12n,
      ],
      "a signed narrowing cast": [
        `function g(x: int8) -> uint256 { return x as uint256 + 1; };`,
        `out = g(n as int8);`,
        8n,
      ],
      "a hash": [
        `function g(h: bytes32) -> uint256 { return h as uint256; };`,
        `out = g(keccak256(0x01)) - (keccak256(0x01) as uint256) + n;`,
        7n,
      ],
      "a length": [
        `function g(x: uint256) -> uint256 { return x * 10; };`,
        `let s = msg.data[0:2];
  out = g(s.length) + n;`,
        27n,
      ],
    } as const;

    for (const [name, [define, body, expected]] of Object.entries(
      argumentKinds,
    )) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should pass ${name} as an argument (level ${level})`, async () => {
          const source = `name ArgumentKinds;
define {
  ${define}
}
storage { [0] n: uint256; [1] out: uint256; }
create { n = 7; }
code {
  ${body}
}`;
          const result = await executeProgram(source, {
            calldata: "0x010203",
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(1n)).toBe(expected);
        });
      }
    }

    // A value live across a block boundary must have a home in memory
    const crossingValues = {
      "a cast across an if": [
        `let y = (n + 1) as uint8;
  if (n > 0) { n = 1; }
  out = y as uint256;`,
        8n,
      ],
      "a cast across a call": [
        `let y = (n + 1) as uint8;
  out = g(1) + (y as uint256);`,
        9n,
      ],
      "a hash across a call": [
        `let h = keccak256(0x01);
  out = g(n) + (h as uint256) - (keccak256(0x01) as uint256);`,
        7n,
      ],
    } as const;

    for (const [name, [body, expected]] of Object.entries(crossingValues)) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should keep ${name} (level ${level})`, async () => {
          const source = `name CrossingValues;
define {
  function g(x: uint256) -> uint256 { return x; };
}
storage { [0] n: uint256; [1] out: uint256; }
create { n = 7; }
code {
  ${body}
}`;
          const result = await executeProgram(source, {
            calldata: "",
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(1n)).toBe(expected);
        });
      }
    }
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

    it("should support recursion at optimization level 2", async () => {
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

    it("should support factorial at optimization level 3", async () => {
      const source = `name FactorialOpt;

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
        optimizationLevel: 3,
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

    // Block merging (level 3) folds the loop's update block into the
    // body; the header's phis must then name the merged block.
    const loopCarried = {
      "a loop-carried local": [
        `name LoopCarried;
storage { [0] total: uint256; }
code {
  let acc: uint256 = 0;
  for (let i: uint256 = 0; i < 3; i = i + 1) { acc = acc + i + 1; }
  total = acc;
}`,
        6n,
      ],
      "an internal call in a loop": [
        `name Weights;
define {
  function weight(x: uint256, w: uint256) -> uint256 {
    return x * w + 1;
  };
}
storage { [0] total: uint256; }
code {
  let acc: uint256 = 0;
  for (let i: uint256 = 0; i < 3; i = i + 1) { acc = acc + weight(i, 7); }
  total = acc;
}`,
        24n,
      ],
    } as const;

    for (const [name, [source, expected]] of Object.entries(loopCarried)) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should compute ${name} (level ${level})`, async () => {
          const result = await executeProgram(source, {
            calldata: "",
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(0n)).toBe(expected);
        });
      }
    }

    // `flag` sets the iteration count. Storage slot 2 (`other`) holds
    // the result.
    const loopLocals = {
      // The loop must carry the inner `w`, not the outer one it shadows
      "a shadowed local": [
        `let w: uint256 = 7;
  if (flag < 5) {
    let w: uint256 = 1;
    for (let i: uint256 = 0; i < flag + 1; i = i + 1) { w = w + 1; }
    other = w;
  }`,
        [2n, 3n, 4n, 5n],
      ],
      // The header's phis for `a` and `b` read each other's old values
      "a swap": [
        `let a: uint256 = 1;
  let b: uint256 = 2;
  for (let i: uint256 = 0; i < flag + 1; i = i + 1) {
    let t: uint256 = a;
    a = b;
    b = t;
  }
  other = a * 10 + b;`,
        [21n, 12n, 21n, 12n],
      ],
    } as const;

    for (const [name, [body, expected]] of Object.entries(loopLocals)) {
      for (const flag of [0, 1, 2, 3] as const) {
        for (const level of [0, 1, 2, 3] as const) {
          it(`should compute ${name} in a loop (flag ${flag}, level ${level})`, async () => {
            const source = `name LoopLocals;
storage { [0] flag: uint256; [1] out: uint256; [2] other: uint256; }
create { flag = ${flag}; }
code {
  ${body}
}`;
            const result = await executeProgram(source, {
              calldata: "",
              optimizationLevel: level,
            });

            expect(result.callSuccess).toBe(true);
            expect(await result.getStorage(2n)).toBe(expected[flag]);
          });
        }
      }
    }
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

    // A path that leaves a variable alone must keep the value the
    // variable had before the branch. `flag` picks the path.
    const keptValues = {
      "a one-armed if": [
        "",
        `let w: uint256 = 7;
  if (flag == 1) { w = 2; }
  out = w;`,
        [7n, 2n],
      ],
      "an else that does not assign": [
        "",
        `let w: uint256 = 7;
  if (flag == 1) { w = 2; } else { other = 1; }
  out = w;`,
        [7n, 2n],
      ],
      "an else that reads": [
        "",
        `let w: uint256 = 7;
  if (flag == 1) { w = 2; } else { other = w; }
  out = w + other;`,
        [14n, 2n],
      ],
      "a later if": [
        "",
        `let w: uint256 = 7;
  if (flag == 1) { w = 2; }
  if (flag == 0) { other = w; }
  out = w;`,
        [7n, 2n],
      ],
      "an arm that only copies": [
        "",
        `let v: uint256 = flag + 3;
  let w: uint256 = 7;
  if (flag == 1) { w = v; }
  out = w;`,
        [7n, 4n],
      ],
      "a nested if": [
        "",
        `let w: uint256 = 7;
  if (flag == 1) { w = 2; if (flag == 5) { other = 1; } }
  out = w;`,
        [7n, 2n],
      ],
      "an internal call": [
        `define {
  function id(x: uint256) -> uint256 { return x; };
}`,
        `let w: uint256 = 7;
  if (flag == 1) { w = id(2); }
  out = w;`,
        [7n, 2n],
      ],
      "a for loop that may break": [
        "",
        `let w: uint256 = 7;
  for (let i: uint256 = 0; i < 3; i = i + 1) {
    if (i == flag + 2) { w = 2; break; }
  }
  out = w;`,
        [2n, 7n],
      ],
      "a for loop that assigns, then may break": [
        "",
        `let w: uint256 = 7;
  for (let i: uint256 = 0; i < 3; i = i + 1) {
    w = i;
    if (i == flag * 5 + 1) { break; }
  }
  out = w;`,
        [1n, 2n],
      ],
    } as const;

    for (const [name, [define, body, expected]] of Object.entries(keptValues)) {
      for (const flag of [0, 1] as const) {
        for (const level of [0, 1, 2, 3] as const) {
          it(`should keep a value past ${name} (flag ${flag}, level ${level})`, async () => {
            const source = `name KeptValue;
${define}
storage { [0] flag: uint256; [1] out: uint256; [2] other: uint256; }
create { flag = ${flag}; }
code {
  ${body}
}`;
            const result = await executeProgram(source, {
              calldata: "",
              optimizationLevel: level,
            });

            expect(result.callSuccess).toBe(true);
            expect(await result.getStorage(1n)).toBe(expected[flag]);
          });
        }
      }
    }
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

  describe("modulo", () => {
    const program = (expr: string) => `name Modulo;

storage {
  [0] a: uint256;
  [1] b: uint256;
  [2] result: uint256;
}

create {
  a = 1071;
  b = 462;
  result = 99;
}

code { result = ${expr}; }`;

    for (const level of [0, 1, 2, 3] as const) {
      it(`should compute % at optimization level ${level}`, async () => {
        const result = await executeProgram(program("a % b"), {
          calldata: "",
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(2n)).toBe(147n);
      });

      it(`should yield 0 for x % 0 at optimization level ${level}`, async () => {
        const result = await executeProgram(program("a % (b - b)"), {
          calldata: "",
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(2n)).toBe(0n);
      });

      it(`should match / for a zero divisor at level ${level}`, async () => {
        const result = await executeProgram(program("a / (b - b)"), {
          calldata: "",
          optimizationLevel: level,
        });

        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(2n)).toBe(0n);
      });

      it(`should fold constant % at optimization level ${level}`, async () => {
        const result = await executeProgram(program("1071 % 462"), {
          calldata: "",
          optimizationLevel: level,
        });

        expect(await result.getStorage(2n)).toBe(147n);
      });
    }
  });
});
