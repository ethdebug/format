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

export const functionCallAndReturn = `name Adder;

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
  result = add(3, 4);
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
