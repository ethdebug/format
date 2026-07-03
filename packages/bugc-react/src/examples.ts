/**
 * A small, curated set of BUG programs for the docs playground's
 * example selector. Kept intentionally short and clean — these
 * strings are shown verbatim in the editor, so they carry no
 * `/*@test*\/`-style behavioral annotations (unlike the raw
 * `packages/bugc/examples` sources they're distilled from).
 *
 * The set is validated by examples.test.ts: every entry must
 * compile to bytecode without errors.
 */

/** A named, display-labelled BUG source for the example selector. */
export interface BugExample {
  /** Stable identifier (used as the <option> value). */
  name: string;
  /** Human-readable label shown in the dropdown. */
  displayName: string;
  /** The BUG source. */
  code: string;
}

const counter = `name Counter;

storage {
  [0] count: uint256;
  [1] threshold: uint256;
}

create {
  count = 0;
  threshold = 100;
}

code {
  // Increment the counter, wrapping when it hits the threshold
  count = count + 1;
  if (count >= threshold) {
    count = 0;
  }
}
`;

const functions = `name Functions;

define {
  // A leaf helper
  function add(a: uint256, b: uint256) -> uint256 {
    return a + b;
  };

  // Calls add() twice — a nested function call
  function addThree(x: uint256, y: uint256, z: uint256) -> uint256 {
    let partial = add(x, y);
    return add(partial, z);
  };
}

storage {
  [0] result: uint256;
}

code {
  result = addThree(10, 20, 30);
}
`;

const arrays = `name Arrays;

storage {
  [0] numbers: array<uint256, 5>;
  [1] sum: uint256;
  [2] max: uint256;
}

code {
  // Fill the array with squares: 0, 1, 4, 9, 16
  for (let i = 0; i < 5; i = i + 1) {
    numbers[i] = i * i;
  }

  // Sum every element
  sum = 0;
  for (let i = 0; i < 5; i = i + 1) {
    sum = sum + numbers[i];
  }

  // Track the largest element
  max = numbers[0];
  for (let i = 1; i < 5; i = i + 1) {
    if (numbers[i] > max) {
      max = numbers[i];
    }
  }
}
`;

/** The curated example set, in display order. */
export const bugExamples: BugExample[] = [
  { name: "counter", displayName: "Counter", code: counter },
  { name: "functions", displayName: "Function calls", code: functions },
  { name: "arrays", displayName: "Arrays & loops", code: arrays },
];
