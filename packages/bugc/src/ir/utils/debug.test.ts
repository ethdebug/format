import { describe, it, expect } from "vitest";
import type * as Ir from "#ir";
import {
  combineDebugContexts,
  dropInstructions,
  markersOf,
  placeActivations,
} from "./debug.js";

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

  const at = (block: string): Ir.Function.Origin => ({
    function: "main",
    block,
    index: 0,
  });

  it("carries `callOrigin` with a moved invoke", () => {
    const placed = placeActivations(
      [invoke("f")],
      undefined,
      { before: plain(), after: { ...plain(), callOrigin: at("other") } },
      at("call"),
    );
    expect(placed.after?.callOrigin).toEqual(at("call"));
    expect(placed.before?.callOrigin).toBeUndefined();
  });

  it("keeps the call origin of the outermost invoke", () => {
    // Moved after, an invoke comes before the op's own: it is outermost
    const after = placeActivations(
      [invoke("f")],
      undefined,
      { after: { ...debug(invoke("g")), callOrigin: at("g") } },
      at("f"),
    );
    expect(after.after?.callOrigin).toEqual(at("f"));
    // Moved before, it comes after the op's own
    const before = placeActivations(
      [invoke("f")],
      undefined,
      { before: { ...debug(invoke("e")), callOrigin: at("e") } },
      at("f"),
    );
    expect(before.before?.callOrigin).toEqual(at("e"));
  });

  it("gives no call origin to invokes split from the first", () => {
    // `callOrigin` is `f`'s: `g`'s call origin is not known
    const placed = placeActivations(
      [invoke("f"), ret("f"), invoke("g")],
      undefined,
      { before: plain(), after: plain() },
      at("f"),
    );
    expect(names(placed.before)).toEqual(["invoke f", "return f"]);
    expect(placed.before?.callOrigin).toEqual(at("f"));
    expect(names(placed.after)).toEqual(["invoke g"]);
    expect(placed.after?.callOrigin).toBeUndefined();
  });
});

describe("dropInstructions", () => {
  it("carries a dropped instruction's invoke with its `callOrigin`", () => {
    const callOrigin: Ir.Function.Origin = {
      function: "main",
      block: "entry",
      index: 3,
    };
    const dropped = {
      kind: "env",
      op: "msg_sender",
      dest: "t1",
      operationDebug: { ...debug(invoke("f")), callOrigin },
    } as unknown as Ir.Instruction;
    const kept = {
      kind: "env",
      op: "msg_value",
      dest: "t2",
      operationDebug: plain(),
    } as unknown as Ir.Instruction;
    const block = {
      id: "inl0$entry",
      phis: [],
      instructions: [dropped, kept],
      terminator: { kind: "jump", target: "next", operationDebug: {} },
      predecessors: new Set(),
      debug: {},
    } as unknown as Ir.Block;

    const { instructions } = dropInstructions(block, new Set([dropped]), {
      isEntry: false,
    });
    expect(instructions).toHaveLength(1);
    expect(names(instructions[0].operationDebug)).toEqual(["invoke f"]);
    expect(instructions[0].operationDebug.callOrigin).toEqual(callOrigin);
  });
});

describe("combineDebugContexts", () => {
  it("keeps the call origin of the debug that carries the invoke", () => {
    const callOrigin: Ir.Function.Origin = {
      function: "main",
      block: "entry",
      index: 2,
    };
    const combined = combineDebugContexts(plain(), {
      ...debug(invoke("f")),
      callOrigin,
    });
    expect(names(combined)).toEqual(["invoke f"]);
    expect(combined.callOrigin).toEqual(callOrigin);
  });
});
