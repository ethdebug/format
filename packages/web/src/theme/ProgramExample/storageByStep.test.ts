import { describe, it, expect } from "vitest";

import { storageByStep } from "./storageByStep";

const step = (opcode: string, stack: bigint[] = []) => ({
  pc: 0,
  opcode,
  stack,
});

describe("storageByStep", () => {
  const slot0 = `0x${"00".padStart(2, "0")}`;
  const word = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

  // stack arrays list the top of the stack last
  const trace = [
    step("PUSH1"),
    step("SSTORE", [1n, 0n]),
    step("PUSH1"),
    step("SSTORE", [2n, 0n]),
    step("STOP"),
  ];

  it("shows storage as of each step, not the final storage", () => {
    const states = storageByStep(trace, {});

    expect(states[0]).toEqual({});
    expect(states[1]).toEqual({});
    expect(states[2]).toEqual({ [slot0]: word(1) });
    expect(states[3]).toEqual({ [slot0]: word(1) });
    expect(states[4]).toEqual({ [slot0]: word(2) });
  });

  it("starts from the given initial storage", () => {
    const states = storageByStep(trace, { "0x05": word(9) });

    expect(states[0]).toEqual({ "0x05": word(9) });
    expect(states[4]).toEqual({ "0x05": word(9), [slot0]: word(2) });
  });

  it("removes slots that are written with zero", () => {
    const states = storageByStep([step("SSTORE", [0n, 0n]), step("STOP")], {
      [slot0]: word(7),
    });

    expect(states[0]).toEqual({ [slot0]: word(7) });
    expect(states[1]).toEqual({});
  });
});
