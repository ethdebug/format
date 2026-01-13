import { expect, describe, it, beforeEach } from "vitest";

import { observeTrace } from "../test/index.js";
import { observeTraceTests } from "./test-cases.js";

describe("dereference (integration)", () => {
  describe("changing pointer values over the course of a trace", () => {
    for (const [name, test] of Object.entries(observeTraceTests)) {
      const { expectedValues, ...options } = test;

      describe(`example pointer: ${name}`, () => {
        it("resolves to values containing the expected sequence", async () => {
          const observedValues = await observeTrace(options as any);

          expect(observedValues).toEqual(
            expect.arrayContaining(expectedValues as any),
          );
        });
      });
    }
  });
});
