import { describe, it, expect } from "vitest";

import { stripTestAnnotations } from "./annotations.js";

describe("stripTestAnnotations", () => {
  it("removes a /*@test*/ block sitting on its own lines", () => {
    const source = [
      "create {",
      "  value = 1;",
      "  /*@test value-set",
      "  variables:",
      "    value:",
      "      value: 1",
      "  */",
      "}",
      "",
    ].join("\n");

    expect(stripTestAnnotations(source)).toBe(
      ["create {", "  value = 1;", "}", ""].join("\n"),
    );
  });

  it("removes a /**@test*/ JSDoc-style block", () => {
    const source = [
      "create {",
      "  value = 1;",
      "  /**@test value-set",
      "   * variables:",
      "   *   value:",
      "   *     value: 1",
      "   */",
      "}",
      "",
    ].join("\n");

    expect(stripTestAnnotations(source)).toBe(
      ["create {", "  value = 1;", "}", ""].join("\n"),
    );
  });

  it("collapses the blank lines left around removed blocks", () => {
    const source = [
      "  lastSender = msg.sender;",
      "",
      "  /*@test a",
      "  variables: { x: 1 }",
      "  */",
      "",
      "  /*@test b",
      "  variables: { y: 2 }",
      "  */",
      "  return;",
      "",
    ].join("\n");

    expect(stripTestAnnotations(source)).toBe(
      ["  lastSender = msg.sender;", "", "  return;", ""].join("\n"),
    );
  });

  it("strips // @wip, @skip, and @expect-* directive lines", () => {
    const source = [
      "// @wip",
      "// @skip needs work",
      "// @expect-parse-error",
      "// @expect-bytecode-error",
      "name Thing;",
      "",
    ].join("\n");

    expect(stripTestAnnotations(source)).toBe(["name Thing;", ""].join("\n"));
  });

  it("leaves ordinary // comments and code untouched", () => {
    const source = [
      "code {",
      "  // a normal comment",
      "  x = 1; // trailing comment",
      "}",
      "",
    ].join("\n");

    expect(stripTestAnnotations(source)).toBe(source);
  });

  it("does not touch block comments that are not @test", () => {
    const source = ["/* just a comment */", "name Thing;", ""].join("\n");

    expect(stripTestAnnotations(source)).toBe(source);
  });

  it("normalizes to a single trailing newline and no leading blanks", () => {
    const source = ["", "", "name Thing;", "", "", ""].join("\n");

    expect(stripTestAnnotations(source)).toBe(["name Thing;", ""].join("\n"));
  });

  it("removes an inline @test block but keeps the code before it", () => {
    const source = ["  x = 1;  /*@test t\n  variables: {}\n  */", ""].join(
      "\n",
    );

    expect(stripTestAnnotations(source)).toBe(["  x = 1;", ""].join("\n"));
  });
});
