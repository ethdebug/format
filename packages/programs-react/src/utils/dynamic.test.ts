/**
 * Tests for dynamic instruction resolution.
 */

import { describe, it, expect } from "vitest";
import {
  resolveDynamicInstruction,
  type DynamicInstruction,
  type ContextThunk,
} from "./dynamic.js";

describe("resolveDynamicInstruction", () => {
  const source = {
    id: "test-source",
    path: "/test/source.js",
    language: "javascript",
    contents: "let x = 1;\nlet y = 2;\nlet z = 3;",
  };

  it("passes through static context unchanged", () => {
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context: { remark: "static context" },
    };

    const result = resolveDynamicInstruction(instruction, {
      sources: [source],
    });

    expect(result.context).toEqual({ remark: "static context" });
    expect(result.offset).toBe(0);
    expect(result.operation).toEqual({
      mnemonic: "PUSH1",
      arguments: ["0x01"],
    });
  });

  it("resolves dynamic context thunk", () => {
    const context: ContextThunk = ({ findSourceRange }) => {
      const range = findSourceRange("let x");
      return {
        code: {
          source: { id: source.id },
          range: range?.range,
        },
      };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    const result = resolveDynamicInstruction(instruction, {
      sources: [source],
    });

    expect(result.context).toEqual({
      code: {
        source: { id: "test-source" },
        range: {
          offset: 0,
          length: 5,
        },
      },
    });
  });

  it("findSourceRange locates string in source", () => {
    const context: ContextThunk = ({ findSourceRange }) => {
      const range = findSourceRange("let y");
      return { remark: `found at ${range?.range?.offset}` };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    const result = resolveDynamicInstruction(instruction, {
      sources: [source],
    });

    // "let y" starts at position 11 (after "let x = 1;\n")
    expect(result.context).toEqual({ remark: "found at 11" });
  });

  it("findSourceRange with after option skips to position after query", () => {
    const sourceWithRepeats = {
      id: "repeats",
      path: "/test/repeats.js",
      language: "javascript",
      contents: "let a = 1; let a = 2; let a = 3;",
    };

    const context: ContextThunk = ({ findSourceRange }) => {
      // Find second occurrence of "let a" by searching after the first "= 1"
      const range = findSourceRange("let a", { after: "= 1" });
      return { remark: `found at ${range?.range?.offset}` };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    const result = resolveDynamicInstruction(instruction, {
      sources: [sourceWithRepeats],
    });

    // Second "let a" starts at position 11
    expect(result.context).toEqual({ remark: "found at 11" });
  });

  it("throws when after query not found", () => {
    const context: ContextThunk = ({ findSourceRange }) => {
      findSourceRange("let x", { after: "nonexistent" });
      return { remark: "should not reach here" };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    expect(() =>
      resolveDynamicInstruction(instruction, { sources: [source] }),
    ).toThrow(/could not find string nonexistent/);
  });

  it("throws when query not found", () => {
    const context: ContextThunk = ({ findSourceRange }) => {
      findSourceRange("nonexistent");
      return { remark: "should not reach here" };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    expect(() =>
      resolveDynamicInstruction(instruction, { sources: [source] }),
    ).toThrow(/could not find string nonexistent/);
  });

  it("returns undefined range when no sources", () => {
    const context: ContextThunk = ({ findSourceRange }) => {
      const range = findSourceRange("let x");
      return { remark: range ? "found" : "not found" };
    };
    const instruction: DynamicInstruction = {
      offset: 0,
      operation: { mnemonic: "PUSH1", arguments: ["0x01"] },
      context,
    };

    const result = resolveDynamicInstruction(instruction, { sources: [] });

    expect(result.context).toEqual({ remark: "not found" });
  });
});
