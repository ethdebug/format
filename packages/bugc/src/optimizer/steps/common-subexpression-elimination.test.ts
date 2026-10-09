import { describe, it, expect } from "vitest";

import { compile } from "#compiler";
import type * as Ir from "#ir";

describe("CommonSubexpressionEliminationStep", () => {
  // `msg.value` before and after a call that is not inlined (it
  // recurses): computing it again is cheaper than keeping it live
  // across the call, so the value is not reused
  const source = `name Rec;
define {
  function g(n: uint256) -> uint256 {
    let a = msg.value + n;
    if (n == 0) { return a; }
    let b = g(n - 1);
    return a + b + msg.value;
  };
}
storage { [0] r: uint256; }
create {}
code { r = g(3); }`;

  for (const level of [2, 3] as const) {
    it(`reuses no value across a call (level ${level})`, async () => {
      const result = await compile({
        to: "ir",
        source,
        optimizer: { level },
      });
      if (!result.success) throw new Error("compile failed");
      const g = result.value.ir.functions.get("g")!;
      const values = [...g.blocks.values()]
        .flatMap((block) => block.instructions)
        .filter(
          (inst): inst is Ir.Instruction.Env =>
            inst.kind === "env" && inst.op === "msg_value",
        );
      expect(values).toHaveLength(2);
    });
  }
});
