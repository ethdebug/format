import { describe, it, expect } from "vitest";

import * as Format from "@ethdebug/format";
import * as Ir from "#ir";

import { buildProgram } from "./program-builder.js";

describe("buildProgram", () => {
  it("identifies the program with the specification version", () => {
    const module: Ir.Module = {
      name: "Test",
      sourceId: "test",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "entry",
            {
              id: "entry",
              phis: [],
              instructions: [],
              terminator: { kind: "return", operationDebug: {} },
              predecessors: new Set(),
              debug: {},
            } as Ir.Block,
          ],
        ]),
      },
    };

    const program = buildProgram([], "call", module);

    expect(program.ethdebug).toEqual({
      schema: "schema:ethdebug/format/program",
      version: Format.version,
    });
  });
});
