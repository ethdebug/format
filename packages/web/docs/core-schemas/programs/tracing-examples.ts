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
