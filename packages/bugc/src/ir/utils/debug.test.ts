import { describe, it, expect } from "vitest";
import type * as Ir from "#ir";
import { markersOf, placeActivations } from "./debug.js";

const invoke = (identifier: string) => ({ invoke: { identifier } });
const ret = (identifier: string) => ({ return: { identifier } });
const debug = (...markers: object[]): Ir.Instruction.Debug => ({
  context: (markers.length === 1
    ? markers[0]
    : { gather: markers }) as Ir.Instruction.Debug["context"],
});
const plain = (): Ir.Instruction.Debug => ({
  context: { code: {} } as never,
});
const names = (d: Ir.Instruction.Debug | undefined) =>
  markersOf(d).map((m) =>
    "invoke" in m
      ? `invoke ${(m.invoke as { identifier: string }).identifier}`
      : `return ${(m.return as { identifier: string }).identifier}`,
  );

describe("placeActivations", () => {
  it("puts an invoke on the op after", () => {
    const placed = placeActivations([invoke("f")], undefined, {
      before: plain(),
      after: debug(invoke("g")),
    });
    expect(names(placed.before)).toEqual([]);
    expect(names(placed.after)).toEqual(["invoke f", "invoke g"]);
  });

  it("puts a return on the op before", () => {
    const placed = placeActivations([ret("f")], undefined, {
      before: debug(invoke("f")),
      after: debug(invoke("g")),
    });
    expect(names(placed.before)).toEqual(["invoke f", "return f"]);
    expect(names(placed.after)).toEqual(["invoke g"]);
  });

  it("never puts a return after an invoke it came before", () => {
    // The return cannot go on an op that opens a call
    expect(
      placeActivations([ret("f")], undefined, { after: debug(invoke("g")) })
        .dropped,
    ).toEqual([ret("f")]);
    // An invoke cannot follow a return on the op before
    expect(
      placeActivations([invoke("g")], undefined, { before: debug(ret("f")) })
        .dropped,
    ).toEqual([invoke("g")]);
  });

  it("splits a return, then an invoke, between the two", () => {
    const placed = placeActivations([ret("e"), invoke("f")], undefined, {
      before: plain(),
      after: plain(),
    });
    expect(names(placed.before)).toEqual(["return e"]);
    expect(names(placed.after)).toEqual(["invoke f"]);
  });

  it("keeps a call wholly on what is removed whole", () => {
    const placed = placeActivations([invoke("f"), ret("f")], undefined, {
      before: debug(ret("e")),
      after: plain(),
    });
    expect(names(placed.before)).toEqual(["return e"]);
    expect(names(placed.after)).toEqual(["invoke f", "return f"]);
  });

  it("drops what no neighbour can take, and lists it", () => {
    const placed = placeActivations([invoke("f"), ret("f")], undefined, {
      before: debug(ret("e")),
      after: debug(invoke("g")),
    });
    expect(names(placed.before)).toEqual(["return e"]);
    expect(names(placed.after)).toEqual(["invoke g"]);
    expect(placed.dropped).toEqual([invoke("f"), ret("f")]);
  });

  it("carries `returned` with a moved return", () => {
    const returned = plain();
    const placed = placeActivations([ret("f")], returned, {
      before: debug(invoke("f")),
    });
    expect(placed.before?.returned).toBe(returned);
  });
});
