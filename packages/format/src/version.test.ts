import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { version } from "#version";

describe("version", () => {
  it("equals package.json's version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(version).toBe(manifest.version);
  });
});
