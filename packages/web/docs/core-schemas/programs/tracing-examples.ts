import { exampleSources, stripTestAnnotations } from "@ethdebug/bugc/examples";

/**
 * SimpleFunctions, referenced from the canonical bugc examples — the same
 * `basic/functions.bug` the BUG playground dropdown sources — with bugc's
 * inline test annotations stripped for display. Kept DRY rather than
 * copying the `.bug` source here.
 */
export const simpleFunctions = stripTestAnnotations(
  exampleSources["basic/functions.bug"],
);

export const counterIncrement = `name Counter;

storage {
  [0] count: uint256;
}

create {
  count = 0;
}

code {
  count = count + 1;
}`;

export const thresholdCheck = `name ThresholdCounter;

storage {
  [0] count: uint256;
  [1] threshold: uint256;
}

create {
  count = 0;
  threshold = 5;
}

code {
  count = count + 1;

  if (count >= threshold) {
    count = 0;
  }
}`;

export const multipleStorageSlots = `name MultiSlot;

storage {
  [0] a: uint256;
  [1] b: uint256;
  [2] sum: uint256;
}

create {
  a = 10;
  b = 20;
  sum = 0;
}

code {
  sum = a + b;
  a = a + 1;
  b = b + 1;
}`;

export const mutualRecursion = `name EvenOdd;

define {
  function isEven(n: uint256) -> uint256 {
    if (n == 0) { return 1; }
    else { return isOdd(n - 1); }
  };
  function isOdd(n: uint256) -> uint256 {
    if (n == 0) { return 0; }
    else { return isEven(n - 1); }
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = isEven(4);
}`;

export const tailRecursiveSum = `name TailSum;

define {
  function sum(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; }
    else { return sum(n - 1, acc + n); }
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = sum(5, 0);
}`;

export const tailRecursiveFactorial = `name TailFactorial;

define {
  function fact(n: uint256, acc: uint256) -> uint256 {
    if (n == 0) { return acc; }
    else { return fact(n - 1, acc * n); }
  };
}

storage {
  [0] result: uint256;
}

create {
  result = 0;
}

code {
  result = fact(5, 1);
}`;

export const inlineDemo = `name InlineDemo;

define {
  function square(x: uint256) -> uint256 {
    return x * x;
  };
}

storage {
  [0] a: uint256;
  [1] b: uint256;
  [2] sumOfSquares: uint256;
}

create {
  a = 3;
  b = 4;
  sumOfSquares = 0;
}

code {
  sumOfSquares = square(a) + square(b);
}`;
