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

export const recursiveCount = `name Counter;

define {
  function succ(n: uint256) -> uint256 {
    return n + 1;
  };
  function count(n: uint256, target: uint256) -> uint256 {
    if (n < target) {
      return count(succ(n), target);
    } else {
      return n;
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
  result = count(0, 5);
}`;
