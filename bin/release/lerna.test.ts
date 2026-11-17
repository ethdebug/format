import { describe, expect, it } from "vitest";

import { parseChanged } from "./lerna.js";

describe("parseChanged", () => {
  it("reads names from the JSON that follows any log noise", () => {
    const stdout = 'lerna notice\n[\n  { "name": "@ethdebug/evm" }\n]\n';
    expect(parseChanged(stdout, "", 0)).toEqual(["@ethdebug/evm"]);
  });

  it("is empty when Lerna says nothing changed", () => {
    expect(parseChanged("", "lerna info No changed packages found", 1)).toEqual(
      [],
    );
  });

  it("throws for any other failure", () => {
    expect(() => parseChanged("", "lerna ERR! boom", 1)).toThrow(/boom/);
    expect(() => parseChanged("", "", null)).toThrow(/lerna changed failed/);
  });
});
