import { describe, it, expect } from "vitest";
import type * as Ir from "#ir";
import { activationsOf, moveActivations } from "./debug.js";

const invoke = (identifier: string) => ({ invoke: { identifier } });
const ret = (identifier: string) => ({ return: { identifier } });
const debug = (...markers: object[]): Ir.Instruction.Debug => ({
  context: (markers.length === 1
    ? markers[0]
    : { gather: markers }) as Ir.Instruction.Debug["context"],
});
const markers = (d: Ir.Instruction.Debug | undefined) => [
  ...activationsOf(d?.context, "invoke").map(
    (v) => `invoke ${(v as { identifier: string }).identifier}`,
  ),
  ...activationsOf(d?.context, "return").map(
    (v) => `return ${(v as { identifier: string }).identifier}`,
  ),
];

describe("moveActivations", () => {
  it("moves an invoke onto the instruction after", () => {
    const moved = moveActivations(debug(invoke("f")), {
      before: { context: { code: {} } as never },
      after: debug(invoke("g")),
    });
    expect(markers(moved?.before)).toEqual([]);
    expect(markers(moved?.after)).toEqual(["invoke f", "invoke g"]);
  });

  it("moves a return onto the instruction before", () => {
    const moved = moveActivations(debug(ret("f")), {
      before: debug(invoke("f")),
      after: debug(invoke("g")),
    });
    expect(markers(moved?.before)).toEqual(["invoke f", "return f"]);
    expect(markers(moved?.after)).toEqual(["invoke g"]);
  });

  it("never puts a return after an invoke it came before", () => {
    // Only the instruction after is there, and it opens a call: the
    // return cannot go on it
    expect(
      moveActivations(debug(ret("f")), { after: debug(invoke("g")) }),
    ).toBeUndefined();
    // An invoke cannot follow a return on the instruction before
    expect(
      moveActivations(debug(invoke("g")), { before: debug(ret("f")) }),
    ).toBeUndefined();
  });

  it("keeps a call wholly on the removed instruction whole", () => {
    const moved = moveActivations(debug(invoke("f"), ret("f")), {
      before: debug(ret("e")),
      after: { context: { code: {} } as never },
    });
    expect(markers(moved?.before)).toEqual(["return e"]);
    expect(markers(moved?.after)).toEqual(["invoke f", "return f"]);
  });

  it("drops a call wholly on the removed instruction if it must", () => {
    const moved = moveActivations(debug(invoke("f"), ret("f")), {
      before: debug(ret("e")),
      after: debug(invoke("g")),
    });
    expect(markers(moved?.before)).toEqual(["return e"]);
    expect(markers(moved?.after)).toEqual(["invoke g"]);
  });

  it("carries `returned` with a moved return", () => {
    const returned = { context: { code: {} } as never };
    const moved = moveActivations(
      { ...debug(ret("f")), returned },
      { before: debug(invoke("f")) },
    );
    expect(moved?.before?.returned).toBe(returned);
  });
});
