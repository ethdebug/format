import { describe, it, expect } from "vitest";

import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex } from "ethereum-cryptography/utils";

import { compile } from "#compiler";
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

    // A function with no return type, called as a statement. `n` (7)
    // keeps the calls from folding; `out` records the effects.
    const voidCalls = {
      "a void call": [`function bump() { out = out + n; };`, `bump();`, 7n],
      "a void call with arguments and an early return": [
        `function put(x: uint256, y: uint256) {
    if (x > y) { out = x; return; }
    out = y;
  };`,
        `put(n, 3); out = out * 10; put(1, out);`,
        70n,
      ],
      "void calls in a loop": [
        `function bump() { out = out + n; };`,
        `for (let i = 0; i < 3; i = i + 1) { bump(); }`,
        21n,
      ],
      "a void call from a void function": [
        `function bump() { out = out + n; };
  function twice() { bump(); bump(); };`,
        `twice();`,
        14n,
      ],
      "a local across a void call": [
        `function bump() { out = out + n; };`,
        `let y = n + 1; bump(); out = out + y;`,
        15n,
      ],
    } as const;

    for (const [name, [define, body, expected]] of Object.entries(voidCalls)) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should make ${name} (level ${level})`, async () => {
          const source = `name VoidCalls;
define {
  ${define}
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

    // Each parameter gets a distinct weight, so a misordered argument
    // changes the result. `n` (7) keeps the arguments from folding.
    for (const count of [6, 7, 8] as const) {
      const indices = Array.from({ length: count }, (_, i) => i + 1);
      const params = indices.map((i) => `p${i}: uint256`).join(", ");
      const weighted = indices.map((i) => `p${i} * ${10 ** (i - 1)}`);
      const args = indices.map((i) => `n + ${i}`).join(", ");
      const forward = indices.map((i) => `p${i}`).join(", ");
      const value = () =>
        indices.reduce(
          (sum, i) => sum + BigInt(7 + i) * 10n ** BigInt(i - 1),
          0n,
        );

      const calls = {
        "a call": [`out = f(${args});`, value()],
        "a forwarding call": [`out = h(${args});`, value()],
        // The inner call's result, less a constant, is the first argument
        "a nested call": [
          `out = f(f(${args}) - ${value() - 8n}, ` +
            `${indices.slice(1).map((i) => `n + ${i}`)});`,
          value(),
        ],
      } as const;

      for (const [name, [body, expected]] of Object.entries(calls)) {
        for (const level of [0, 1, 2, 3] as const) {
          it(`should make ${name} with ${count} parameters (level ${level})`, async () => {
            const source = `name ManyParams;
define {
  function f(${params}) -> uint256 { return ${weighted.join(" + ")}; };
  function h(${params}) -> uint256 { return f(${forward}); };
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

  describe("casts", () => {
    const word = 2n ** 256n;

    // Each case casts a value of type `from` and stores the result in a
    // `uint256`. The value comes once as a constant, which the optimizer
    // may fold, and once from storage, which it cannot.
    const casts: Record<
      string,
      [string, string, (x: string) => string, bigint]
    > = {
      "uint256 300 to uint8": ["uint256", "300", (x) => `${x} as uint8`, 44n],
      "uint256 255 to uint8": ["uint256", "255", (x) => `${x} as uint8`, 255n],
      "uint256 256 to uint8": ["uint256", "256", (x) => `${x} as uint8`, 0n],
      "uint256 0 to uint8": ["uint256", "0", (x) => `${x} as uint8`, 0n],
      "uint256 max to uint8": ["uint256", "-1", (x) => `${x} as uint8`, 255n],
      "uint16 to uint8": [
        "uint16",
        "0x1234 as uint16",
        (x) => `${x} as uint8`,
        0x34n,
      ],
      "uint8 to uint16": [
        "uint8",
        "200 as uint8",
        (x) => `${x} as uint16`,
        200n,
      ],
      "uint256 200 to int8": [
        "uint256",
        "200",
        (x) => `(${x} as int8) as int256`,
        word - 56n,
      ],
      "uint256 127 to int8": [
        "uint256",
        "127",
        (x) => `(${x} as int8) as int256`,
        127n,
      ],
      "uint256 128 to int8": [
        "uint256",
        "128",
        (x) => `(${x} as int8) as int256`,
        word - 128n,
      ],
      "int256 -1 to uint8": [
        "int256",
        "-1 as int256",
        (x) => `${x} as uint8`,
        255n,
      ],
      "int256 -200 to int8": [
        "int256",
        "-200 as int256",
        (x) => `(${x} as int8) as int256`,
        56n,
      ],
      "int16 min to int8": [
        "int16",
        "-32768 as int16",
        (x) => `(${x} as int8) as int256`,
        0n,
      ],
      "int8 -56 to int16": [
        "int8",
        "-56 as int8",
        (x) => `(${x} as int16) as int256`,
        word - 56n,
      ],
      "int8 -56 to int256": [
        "int8",
        "-56 as int8",
        (x) => `${x} as int256`,
        word - 56n,
      ],
      "int8 -1 to uint8": ["int8", "-1 as int8", (x) => `${x} as uint8`, 255n],
      "uint8 255 to int8": [
        "uint8",
        "255 as uint8",
        (x) => `(${x} as int8) as int256`,
        word - 1n,
      ],
      "int8 -56 to uint16": [
        "int8",
        "-56 as int8",
        (x) => `${x} as uint16`,
        0xffc8n,
      ],
      "int8 -56 to uint256": [
        "int8",
        "-56 as int8",
        (x) => `${x} as uint256`,
        word - 56n,
      ],
      "int256 -56 to uint256": [
        "int256",
        "-56 as int256",
        (x) => `${x} as uint256`,
        word - 56n,
      ],
      "uint256 max to int256": [
        "uint256",
        "-1",
        (x) => `${x} as int256`,
        word - 1n,
      ],
      "uint256 max to address": [
        "uint256",
        "-1",
        (x) => `${x} as address`,
        2n ** 160n - 1n,
      ],
      "address to uint8": [
        "address",
        "0x1234 as address",
        (x) => `${x} as uint8`,
        0x34n,
      ],
      "bytes32 to address": [
        "bytes32",
        "0xffffffffffffffffffffffff00112233445566778899aabbccddeeff00112233",
        (x) => `${x} as address`,
        0x00112233445566778899aabbccddeeff00112233n,
      ],
      "bytes32 to bytes4": [
        "bytes32",
        "0x1122334400000000000000000000000000000000000000000000000000000055",
        (x) => `${x} as bytes4`,
        0x11223344n,
      ],
      "bytes8 to bytes4": [
        "bytes8",
        "0x1122334455667788",
        (x) => `${x} as bytes4`,
        0x11223344n,
      ],
      "bytes4 to bytes8": [
        "bytes4",
        "0x11223344",
        (x) => `${x} as bytes8`,
        0x1122334400000000n,
      ],
      "bytes4 to bytes4": [
        "bytes4",
        "0x11223344",
        (x) => `${x} as bytes4`,
        0x11223344n,
      ],
      "bytes4 to int16": [
        "bytes4",
        "0x1234ff38",
        (x) => `(${x} as int16) as int256`,
        word - 200n,
      ],
    };

    for (const [name, [from, input, cast, expected]] of Object.entries(casts)) {
      const sources = {
        constant: `name Cast;
storage { [0] v: ${from}; [1] out: uint256; }
code { out = (${cast(`(${input})`)}) as uint256; }`,
        "storage value": `name Cast;
storage { [0] v: ${from}; [1] out: uint256; }
create { v = ${input}; }
code { out = (${cast("v")}) as uint256; }`,
      };

      for (const [kind, source] of Object.entries(sources)) {
        for (const level of [0, 1, 2, 3] as const) {
          it(`should cast a ${kind}: ${name} (level ${level})`, async () => {
            const result = await executeProgram(source, {
              calldata: "",
              optimizationLevel: level,
            });

            expect(result.callSuccess).toBe(true);
            expect(await result.getStorage(1n)).toBe(expected);
          });
        }
      }
    }

    // The leading four bytes of the hash of the word 0x00..01
    const hashPrefix = BigInt(
      "0x" + bytesToHex(keccak256(new Uint8Array(32).fill(1, 31))).slice(0, 8),
    );

    const calldata = "0xaabbccdd" + "00".repeat(12) + "11".repeat(20);

    // Casts of values that are not stored: comparisons, hashes and
    // slices of calldata and memory. The call sends `calldata`.
    const others: Record<string, [string, bigint]> = {
      "a narrowed bytes32 compared with a literal": [
        `let h: bytes32 =
    0x1122334400000000000000000000000000000000000000000000000000000000;
  let b = h as bytes4;
  if (b == 0x11223344) { out = 1; }`,
        1n,
      ],
      "a hash narrowed to bytes4": [
        `out = (keccak256(0x01) as bytes4) as uint256;`,
        hashPrefix,
      ],
      "a calldata slice to bytes4": [
        `out = (msg.data[0:4] as bytes4) as uint256;`,
        0xaabbccddn,
      ],
      "a calldata slice compared as bytes4": [
        `let sel = msg.data[0:4] as bytes4;
  if (sel == 0xaabbccdd) { out = 1; }`,
        1n,
      ],
      "a short calldata slice to bytes4": [
        `out = (msg.data[0:2] as bytes4) as uint256;`,
        0xaabb0000n,
      ],
      "a calldata slice to uint256": [
        `out = msg.data[4:36] as bytes32 as uint256;`,
        0x1111111111111111111111111111111111111111n,
      ],
      "a calldata slice to address": [
        `out = msg.data[4:36] as bytes32 as address as uint256;`,
        0x1111111111111111111111111111111111111111n,
      ],
      "a memory slice to bytes4": [
        `let d = msg.data[0:8];
  out = (d[1:5] as bytes4) as uint256;`,
        0xbbccdd00n,
      ],
      "a short memory slice to bytes4": [
        `let d = msg.data[0:8];
  out = (d[1:3] as bytes4) as uint256;`,
        0xbbcc0000n,
      ],
      "msg.data to bytes4": [
        `out = (msg.data as bytes4) as uint256;`,
        0xaabbccddn,
      ],
    };

    for (const [name, [body, expected]] of Object.entries(others)) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should cast ${name} (level ${level})`, async () => {
          const source = `name Cast;
storage { [0] n: uint256; [1] out: uint256; }
create { n = 7; }
code {
  ${body}
}`;
          const result = await executeProgram(source, {
            calldata,
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(1n)).toBe(expected);
        });
      }
    }

    // Chains of casts, calls and slices, mostly without parentheses.
    // Each node of a chain has its own type, so each cast must use it.
    const functions = `define {
  function f() -> uint256 { return 300; };
  function g() -> int8 { return 200 as int8; };
  function h() -> bytes4 { return 0x11223344; };
  function sel(o: uint256) -> bytes4 { return msg.data[o:o+4] as bytes4; };
}`;
    const chains: Record<string, [string, bigint[]]> = {
      "casts of a storage value": [
        `b = v as int8 as int256 as uint256;`,
        [0n, word - 56n],
      ],
      "casts of a slice and a call": [
        `a = (msg.data[0:4] as bytes4) as uint256;
  b = f() as uint8;`,
        [0xaabbccddn, 44n],
      ],
      "casts of calls": [
        `a = g() as int256 as uint256;
  b = (h() as bytes8) as uint256;`,
        [word - 56n, 0x1122334400000000n],
      ],
      "three calls that cast a slice": [
        `a = sel(0) as uint256;
  b = sel(4) as uint256;
  c = sel(32) as uint256;`,
        [0xaabbccddn, 0n, 0x11111111n],
      ],
      "many chains": [
        `a = msg.data[0:4] as bytes4 as uint256;
  b = f() as uint8 as uint256 + (g() as int256 as uint256);
  c = h() as bytes8 as uint256 + (v as int8 as int16 as uint16 as uint256);`,
        [0xaabbccddn, 44n - 56n + word, 0x1122334400000000n + 0xffc8n],
      ],
    };

    for (const [name, [body, expected]] of Object.entries(chains)) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should cast in chains: ${name} (level ${level})`, async () => {
          const source = `name Chains;
${functions}
storage {
  [0] v: uint256; [1] a: uint256; [2] b: uint256; [3] c: uint256;
}
create { v = 200; }
code {
  ${body}
}`;
          const result = await executeProgram(source, {
            calldata,
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          for (const [index, value] of expected.entries()) {
            expect(await result.getStorage(BigInt(index + 1))).toBe(value);
          }
        });
      }
    }
  });

  describe("block.prevrandao", () => {
    const source = `name Randao;
storage { [0] out: uint256; }
code {
  out = block.prevrandao + 1;
}`;

    for (const level of [0, 1, 2, 3] as const) {
      it(`should read PREVRANDAO (level ${level})`, async () => {
        const compiled = await compile({
          to: "bytecode",
          source,
          optimizer: { level },
        });
        if (!compiled.success) throw new Error("compile failed");
        const mnemonics =
          compiled.value.bytecode.runtimeProgram.instructions.map(
            (instruction) => instruction.operation?.mnemonic,
          );
        expect(mnemonics).toContain("PREVRANDAO");

        // @ethdebug/evm runs each call in a block whose prevrandao is 0
        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(1n);
      });
    }
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

  describe("msg.data.length", () => {
    const source = `name DataLength;

storage {
  [0] size: uint256;
}

create {
  size = 99;
}

code { size = msg.data.length; }`;

    for (const level of [0, 1, 2, 3] as const) {
      for (const bytes of [0, 4, 36, 100]) {
        it(`should be ${bytes} for ${bytes} bytes of calldata (level ${level})`, async () => {
          const result = await executeProgram(source, {
            calldata: "ab".repeat(bytes),
            optimizationLevel: level,
          });

          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(0n)).toBe(BigInt(bytes));
        });
      }
    }
  });

  describe("packed storage writes", () => {
    // Fields pack from the low-order end of slot 0:
    // a (1 byte), b (1), c (2), d (4), e (8).
    const define = `define {
  struct S { a: int8; b: uint8; c: int16; d: uint32; e: int64; };
}`;

    // a = -56, b = 7, c = -2, d = 0x01020304, e = -3
    const word = BigInt(
      "0x" + "00".repeat(16) + "fffffffffffffffd" + "01020304" + "fffe07c8",
    );

    const fields = [
      "s.a = -56 as int8;",
      "s.b = 7 as uint8;",
      "s.c = -2 as int16;",
      "s.d = 16909060 as uint32;",
      "s.e = -3 as int64;",
    ];

    for (const level of [0, 1, 2, 3] as const) {
      it(`should mask constants in create (level ${level})`, async () => {
        const source = `name PackedCreate;
${define}
storage { [0] s: S; [1] x: uint256; }
create { ${fields.join(" ")} }
code { x = 1; }`;

        const result = await executeProgram(source, {
          optimizationLevel: level,
        });
        expect(await result.getStorage(0n)).toBe(word);
      });

      it(`should mask constants in either order (level ${level})`, async () => {
        const source = `name PackedReverse;
${define}
storage { [0] s: S; [1] x: uint256; }
create { x = 1; }
code { ${[...fields].reverse().join(" ")} }`;

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(word);
      });

      it(`should mask runtime values (level ${level})`, async () => {
        const source = `name PackedRuntime;
${define}
storage {
  [0] s: S;
  [1] na: int256;
  [2] nc: int256;
  [3] ne: int256;
  [4] t: S;
}
create {
  na = -56 as int256;
  nc = -2 as int256;
  ne = -3 as int256;
}
code {
  let a = na as int8;
  let b = 7 as uint8;
  let c = nc as int16;
  let d = 16909060 as uint32;
  let e = ne as int64;
  s.a = a;
  s.b = b;
  s.c = c;
  s.d = d;
  s.e = e;
  t.e = s.e;
  t.d = s.d;
  t.c = s.c;
  t.b = s.b;
  t.a = s.a;
}`;

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(word);
        expect(await result.getStorage(4n)).toBe(word);
      });

      it(`should keep the fields around writes past offset 0 (level ${level})`, async () => {
        const source = `name PackedMiddle;
${define}
storage { [0] s: S; [1] nc: int256; }
create { nc = -2 as int256; s.a = -56 as int8; s.e = -3 as int64; }
code {
  let b = 7 as uint8;
  let c = nc as int16;
  let d = 16909060 as uint32;
  s.b = b;
  s.c = c;
  s.d = d;
}`;

        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(word);
      });

      // Writes to one field: the later write replaces the earlier
      for (const [writes, expected] of [
        ["s.a = a; s.a = ua;", 0x03n],
        ["s.b = b; s.a = a; s.b = ub;", 0x0003c8n],
      ] as const) {
        it(`should apply \`${writes}\` in order (level ${level})`, async () => {
          const source = `name PackedOverlap;
define { struct T { a: int8; b: int16; }; }
storage { [0] s: T; [1] n: int256; [2] u: uint256; }
create { n = -56 as int256; u = 3; }
code {
  let a = n as int8;
  let b = n as int16;
  let ua = u as int8;
  let ub = u as int16;
  ${writes}
}`;

          const result = await executeProgram(source, {
            calldata: "",
            optimizationLevel: level,
          });
          expect(result.callSuccess).toBe(true);
          expect(await result.getStorage(0n)).toBe(expected);
        });
      }
    }
  });

  describe("narrow storage variables", () => {
    const source = `name Narrow;
storage { [0] x: int8; [1] y: int16; [2] n: int256; }
create { x = -56 as int8; n = -2 as int256; }
code { let v = n as int16; y = v; }`;

    for (const level of [0, 1, 2, 3] as const) {
      it(`should write only their own bytes (level ${level})`, async () => {
        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(0n)).toBe(0xc8n);
        expect(await result.getStorage(1n)).toBe(0xfffen);
      });
    }
  });

  describe("signed storage reads", () => {
    const neg = (n: bigint) => 2n ** 256n - n;

    const source = `name SignedReads;
define {
  struct R { a: int8; b: int16; c: int64; d: int128; };
}
storage {
  [0] s: R;
  [1] x: int8;
  [2] y: int16;
  [3] m: mapping<uint256, int16>;
  [4] t: R;
  [5] n: int256;
  [10] o0: int256;
  [11] o1: int256;
  [12] o2: int256;
  [13] o3: int256;
  [14] o4: int256;
  [15] o5: int256;
  [16] o6: int256;
  [17] o7: int256;
  [18] o8: int256;
}
create {
  s.a = -56 as int8;
  s.b = -2 as int16;
  s.c = -3 as int64;
  s.d = -4 as int128;
  x = -56 as int8;
  y = -300 as int16;
  m[5] = -7 as int16;
  n = -9 as int256;
}
code {
  let a = n as int8;
  let b = n as int16;
  t.a = a;
  t.b = b;
  o0 = s.a;
  o1 = s.b;
  o2 = s.c;
  o3 = s.d;
  o4 = x;
  o5 = y;
  o6 = m[5];
  o7 = t.a;
  o8 = t.b;
}`;

    const expected = [56n, 2n, 3n, 4n, 56n, 300n, 7n, 9n, 9n].map(neg);

    for (const level of [0, 1, 2, 3] as const) {
      it(`should sign-extend narrow signed values (level ${level})`, async () => {
        const result = await executeProgram(source, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        for (const [i, value] of expected.entries()) {
          expect(await result.getStorage(10n + BigInt(i))).toBe(value);
        }
      });
    }
  });

  describe("signed operators", () => {
    const word = 2n ** 256n;
    const toWord = (n: bigint) => ((n % word) + word) % word;
    // A negative literal is a cast of its two's complement, which the
    // optimizer folds (it does not fold negation)
    const literal = (n: bigint, type: string) => {
      const bits = BigInt(type.replace(/^u?int/, ""));
      return `(${n < 0n ? 2n ** bits + n : n} as ${type})`;
    };

    // Store the result of each statement on operands `a` and `b` of
    // `type`, read at runtime from int256 storage, or given as
    // literals, which the optimizer folds
    const program = (
      type: string,
      [a, b]: readonly [bigint, bigint],
      statements: readonly ((
        a: string,
        b: string,
        out: string,
        type: string,
      ) => string)[],
      folded: boolean,
    ) => {
      const out = type.startsWith("u") ? "uint256" : "int256";
      const outputs = statements.map((_, j) => `[${10 + j}] o${j}: ${out};`);
      const [x, y] = folded ? [literal(a, type), literal(b, type)] : ["x", "y"];
      return `name SignedOperators;
storage {
  [0] a: int256;
  [1] b: int256;
  ${outputs.join("\n  ")}
}
create {
  a = ${literal(a, "int256")};
  b = ${literal(b, "int256")};
}
code {
  let x = a as ${type};
  let y = b as ${type};
  ${statements.map((statement, j) => statement(x, y, `o${j}`, out)).join("\n  ")}
}`;
    };

    const check = async (
      source: string,
      level: 0 | 1 | 2 | 3,
      expected: readonly bigint[],
    ) => {
      const result = await executeProgram(source, {
        calldata: "",
        optimizationLevel: level,
      });
      expect(result.callSuccess).toBe(true);
      const actual = [];
      for (const j of expected.keys()) {
        actual.push(await result.getStorage(10n + BigInt(j)));
      }
      expect(actual).toEqual(expected.map(toWord));
    };

    const min = -(2n ** 255n);

    describe("comparisons", () => {
      const comparisons = [
        ["<", (a: bigint, b: bigint) => a < b],
        ["<=", (a: bigint, b: bigint) => a <= b],
        [">", (a: bigint, b: bigint) => a > b],
        [">=", (a: bigint, b: bigint) => a >= b],
        ["==", (a: bigint, b: bigint) => a === b],
        ["!=", (a: bigint, b: bigint) => a !== b],
      ] as const;

      // Each comparison stores 1 when it holds
      const statements = comparisons.map(
        ([op]) =>
          (a: string, b: string, out: string, type: string) =>
            `if (${a} ${op} ${b}) { ${out} = 1 as ${type}; }`,
      );

      const signed = [
        [-3n, -2n],
        [-2n, -3n],
        [-5n, 4n],
        [4n, -5n],
        [-7n, -7n],
        [6n, 6n],
      ] as const;

      const cases = [
        ...["int8", "int16", "int128", "int256"].flatMap((type) =>
          signed.map((operands) => [type, operands] as const),
        ),
        ["int256", [min, -min - 1n]],
        ["uint256", [2n ** 255n, 1n]],
        ["uint256", [1n, 2n ** 255n]],
      ] as const;

      for (const [type, operands] of cases) {
        const [a, b] = operands;
        const expected = comparisons.map(([, compare]) =>
          compare(a, b) ? 1n : 0n,
        );
        for (const folded of [false, true]) {
          const source = program(type, operands, statements, folded);
          for (const level of [0, 1, 2, 3] as const) {
            it(`should compare ${type} ${operands.join(" and ")}${folded ? " as literals" : ""} (level ${level})`, async () => {
              await check(source, level, expected);
            });
          }
        }
      }
    });

    describe("literal operands", () => {
      // A literal takes the type of the other operand
      const statements = [
        (x: string, _: string, out: string) =>
          `if (${x} < 0) { ${out} = 1 as int256; }`,
        (x: string, _: string, out: string) =>
          `if (${x} == 1) { ${out} = 1 as int256; }`,
        (x: string, _: string, out: string) =>
          `if (-1 < ${x}) { ${out} = 1 as int256; }`,
        (x: string, _: string, out: string) =>
          `if (0 >= ${x}) { ${out} = 1 as int256; }`,
        (x: string, _: string, out: string) => `${out} = ${x} / -2;`,
      ];
      const expected = (x: bigint) => [
        x < 0n ? 1n : 0n,
        x === 1n ? 1n : 0n,
        -1n < x ? 1n : 0n,
        0n >= x ? 1n : 0n,
        x / -2n,
      ];

      for (const x of [-3n, -1n, 0n, 1n, 5n]) {
        for (const type of ["int8", "int256"]) {
          const source = program(type, [x, 0n], statements, false);
          for (const level of [0, 1, 2, 3] as const) {
            it(`should compare ${type} ${x} with literals (level ${level})`, async () => {
              await check(source, level, expected(x));
            });
          }
        }
      }

      it("should reject a literal too large for the other operand", async () => {
        await expect(
          executeProgram(`name TooLarge;
storage { [0] n: int8; }
code { if (n < 128) { n = 1 as int8; } }`),
        ).rejects.toThrow("Literal 128 does not fit in int8");
      });

      it("should reject mixed signedness", async () => {
        await expect(
          executeProgram(`name Mixed;
storage { [0] u: uint256; [1] o: uint256; }
code { let x = 1 as int8; if (u > x) { o = 1; } }`),
        ).rejects.toThrow("cannot mix signed and unsigned operands");
      });
    });

    describe("division and remainder", () => {
      // Division truncates toward zero, and the remainder has the sign
      // of the dividend, as in Solidity (and as bigint does). BUG
      // arithmetic does not check for overflow, so the minimum int256
      // divided by -1 wraps to itself.
      const statements = [
        (a: string, b: string, out: string) => `${out} = ${a} / ${b};`,
        (a: string, b: string, out: string) => `${out} = ${a} % ${b};`,
      ];

      const signed = [
        [7n, 2n],
        [-7n, 2n],
        [7n, -2n],
        [-7n, -2n],
        [-6n, 3n],
        [5n, -7n],
      ] as const;

      const cases = [
        ...["int8", "int16", "int128", "int256"].flatMap((type) =>
          signed.map((operands) => [type, operands, null] as const),
        ),
        ["int256", [min, -1n], [min, 0n]],
        ["uint256", [word - 2n, 2n], null],
        ["uint256", [word - 7n, 2n ** 255n], null],
      ] as const;

      for (const [type, [a, b], wrapped] of cases) {
        const expected = wrapped ?? [a / b, a % b];
        for (const folded of [false, true]) {
          const source = program(type, [a, b], statements, folded);
          for (const level of [0, 1, 2, 3] as const) {
            it(`should divide ${type} ${a} by ${b}${folded ? " as literals" : ""} (level ${level})`, async () => {
              await check(source, level, expected);
            });
          }
        }
      }
    });
  });

  describe("narrow mapping values and array elements", () => {
    const neg = (n: bigint) => 2n ** 256n - n;
    const pad = (n: bigint) => n.toString(16).padStart(64, "0");
    const hash = (hex: string) =>
      BigInt("0x" + bytesToHex(keccak256(Buffer.from(hex, "hex"))));

    const mappings = `name NarrowMappings;
storage {
  [0] m8: mapping<uint256, int8>;
  [1] m16: mapping<uint256, int16>;
  [2] m128: mapping<uint256, int128>;
  [3] n: int256;
  [10] o0: int256;
  [11] o1: int256;
  [12] o2: int256;
  [13] o3: int256;
  [14] o4: int256;
  [15] o5: int256;
}
create { n = -2 as int256; }
code {
  m8[5] = n as int8;
  m16[5] = n as int16;
  m128[5] = n as int128;
  m8[6] = -3 as int8;
  m16[6] = -3 as int16;
  m128[6] = -3 as int128;
  o0 = m8[5];
  o1 = m16[5];
  o2 = m128[5];
  o3 = m8[6];
  o4 = m16[6];
  o5 = m128[6];
}`;

    // bugc gives each array element its own slot
    const arrays = `name NarrowArrays;
storage { [0] a: array<int16, 3>; [1] n: int256; [10] o0: int256; }
create { n = -2 as int256; }
code { a[1] = n as int16; o0 = a[1]; }`;

    for (const level of [0, 1, 2, 3] as const) {
      it(`should write only a mapping value's bytes (level ${level})`, async () => {
        const result = await executeProgram(mappings, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        for (const [key, value] of [
          [5n, 2n],
          [6n, 3n],
        ] as const) {
          for (const [slot, bytes] of [
            [0n, 1n],
            [1n, 2n],
            [2n, 16n],
          ] as const) {
            expect(await result.getStorage(hash(pad(key) + pad(slot)))).toBe(
              2n ** (8n * bytes) - value,
            );
          }
        }
        const expected = [2n, 2n, 2n, 3n, 3n, 3n].map(neg);
        for (const [j, value] of expected.entries()) {
          expect(await result.getStorage(10n + BigInt(j))).toBe(value);
        }
      });

      it(`should write only an array element's bytes (level ${level})`, async () => {
        const result = await executeProgram(arrays, {
          calldata: "",
          optimizationLevel: level,
        });
        expect(result.callSuccess).toBe(true);
        expect(await result.getStorage(hash(pad(0n)) + 1n)).toBe(0xfffen);
        expect(await result.getStorage(10n)).toBe(neg(2n));
      });
    }
  });

  describe("narrow arithmetic", () => {
    const word = 2n ** 256n;
    const toWord = (n: bigint) => ((n % word) + word) % word;
    const bitsOf = (type: string) => BigInt(type.replace(/^u?int/, ""));

    // A result keeps the low bits of its type, as a signed value when
    // the type is signed
    const wrap = (n: bigint, type: string) => {
      const size = 2n ** bitsOf(type);
      const low = ((n % size) + size) % size;
      return type.startsWith("u") || low < size / 2n ? low : low - size;
    };

    // A literal of a type is a cast of its two's complement
    const literal = (n: bigint, type: string) =>
      `(${toWord(n) % 2n ** bitsOf(type)} as ${type})`;

    const operators = [
      ["+", (a: bigint, b: bigint) => a + b],
      ["-", (a: bigint, b: bigint) => a - b],
      ["*", (a: bigint, b: bigint) => a * b],
      ["/", (a: bigint, b: bigint) => a / b],
      ["%", (a: bigint, b: bigint) => a % b],
    ] as const;

    // Operands at the boundaries of each type
    const operandsOf = (type: string): (readonly [bigint, bigint])[] => {
      const bits = bitsOf(type);
      if (type.startsWith("u")) {
        const max = 2n ** bits - 1n;
        const half = 2n ** (bits / 2n);
        return [
          [max, 1n],
          [0n, 1n],
          [half, half],
          [max, max],
        ];
      }
      const max = 2n ** (bits - 1n) - 1n;
      const min = -max - 1n;
      return [
        [max, 1n],
        [min, 1n],
        [min, -1n],
        [-1n, max],
      ];
    };

    // Each pair of operands `x` and `y` comes from storage, from
    // calldata, or from literals, which the optimizer folds. Each
    // operator and the negation of `x` store a result in its own slot.
    const sources = ["storage", "calldata", "literals"] as const;

    const program = (
      type: string,
      pairs: readonly (readonly [bigint, bigint])[],
      source: (typeof sources)[number],
    ) => {
      const out = type.startsWith("u") ? "uint256" : "int256";
      const width = operators.length + 1;
      const operand = (n: bigint, k: number, i: number) => {
        switch (source) {
          case "storage":
            return `s${k}${i}`;
          case "calldata": {
            const offset = 32 * (2 * k + i);
            return `(msg.data[${offset}:${offset + 32}] as bytes32 as uint256 as ${type})`;
          }
          case "literals":
            return literal(n, type);
        }
      };
      const storage = pairs.flatMap((_, k) => [
        `[${2 * k}] s${k}0: ${type};`,
        `[${2 * k + 1}] s${k}1: ${type};`,
        ...Array.from(
          { length: width },
          (_, j) => `[${100 + k * width + j}] o${k}${j}: ${out};`,
        ),
      ]);
      const create = pairs.flatMap(([a, b], k) => [
        `s${k}0 = ${literal(a, type)};`,
        `s${k}1 = ${literal(b, type)};`,
      ]);
      const code = pairs.flatMap(([a, b], k) => {
        const [x, y] = [operand(a, k, 0), operand(b, k, 1)];
        return [
          ...operators.map(([op], j) => `o${k}${j} = ${x} ${op} ${y};`),
          `o${k}${operators.length} = -${x};`,
        ];
      });
      return `name NarrowArithmetic;
storage {
  ${storage.join("\n  ")}
}
create {
  ${create.join("\n  ")}
}
code {
  ${code.join("\n  ")}
}`;
    };

    const calldataOf = (pairs: readonly (readonly [bigint, bigint])[]) =>
      "0x" +
      pairs
        .flat()
        .map((n) => toWord(n).toString(16).padStart(64, "0"))
        .join("");

    const types = [8, 16, 32, 64, 128, 256].flatMap((bits) => [
      `uint${bits}`,
      `int${bits}`,
    ]);

    for (const type of types) {
      const pairs = operandsOf(type);
      const expected = pairs.flatMap(([a, b]) => [
        ...operators.map(([, apply]) => wrap(apply(a, b), type)),
        wrap(-a, type),
      ]);
      for (const source of sources) {
        const code = program(type, pairs, source);
        for (const level of [0, 1, 2, 3] as const) {
          it(`should wrap ${type} arithmetic on ${source} (level ${level})`, async () => {
            const result = await executeProgram(code, {
              calldata: calldataOf(pairs),
              optimizationLevel: level,
            });
            expect(result.callSuccess).toBe(true);
            const actual = [];
            for (const j of expected.keys()) {
              actual.push(await result.getStorage(100n + BigInt(j)));
            }
            expect(actual).toEqual(expected.map(toWord));
          });
        }
      }
    }

    // A wrapped result is the value that later expressions see
    const compound = (type: string, values: readonly bigint[]) => {
      const out = type.startsWith("u") ? "uint256" : "int256";
      const wide = type.replace("8", "16");
      return `name NarrowCompound;
storage {
  [0] a: ${type};
  [1] b: ${type};
  [2] c: ${type};
  [3] s: ${type};
  [4] w: ${wide};
  [10] o0: ${out};
  [11] o1: ${out};
  [12] o2: ${out};
  [13] o3: ${out};
  [14] o4: ${out};
  [15] o5: ${out};
  [16] o6: ${out};
  [17] o7: ${out};
}
create {
  a = ${literal(values[0], type)};
  b = ${literal(values[1], type)};
  c = ${literal(values[2], type)};
  w = ${literal(values[3], wide)};
}
code {
  if (a + b < c) { o0 = 1 as ${out}; }
  o1 = (a + b) / ${literal(2n, type)};
  o2 = (a + b) as ${wide};
  s = a + b;
  o3 = s;
  o4 = a + b - c;
  let t = a * b;
  o5 = t;
  o6 = a + w;
  o7 = -(a + b);
}`;
    };

    const compoundCases = [
      // 200 + 100 wraps to 44, which is less than 50
      [
        "uint8",
        [200n, 100n, 50n, 65400n],
        [1n, 22n, 44n, 44n, 250n, 32n, 64n, 212n],
      ],
      // 100 + 100 wraps to -56, which is less than -50
      [
        "int8",
        [100n, 100n, -50n, 32700n],
        [1n, -28n, -56n, -56n, -6n, 16n, -32736n, 56n],
      ],
    ] as const;

    for (const [type, values, expected] of compoundCases) {
      for (const level of [0, 1, 2, 3] as const) {
        it(`should use wrapped ${type} results in later expressions (level ${level})`, async () => {
          const result = await executeProgram(compound(type, values), {
            calldata: "",
            optimizationLevel: level,
          });
          expect(result.callSuccess).toBe(true);
          const actual = [];
          for (const j of expected.keys()) {
            actual.push(await result.getStorage(10n + BigInt(j)));
          }
          expect(actual).toEqual(expected.map(toWord));
        });
      }
    }
  });
});
