import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";

import { parse } from "./parser.js";

const EXAMPLES_DIR = path.resolve(__dirname, "../../examples");

/**
 * The spans of the comments in a source, skipping string literals
 */
function commentSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] === '"') {
      const close = source.indexOf('"', i + 1);
      i = close === -1 ? source.length : close + 1;
    } else if (source.startsWith("//", i)) {
      const newline = source.indexOf("\n", i);
      const end = newline === -1 ? source.length : newline;
      spans.push([i, end]);
      i = end;
    } else if (source.startsWith("/*", i)) {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? source.length : close + 2;
      spans.push([i, end]);
      i = end;
    } else {
      i++;
    }
  }
  return spans;
}

/**
 * Every source location in an AST, with the node's kind
 */
function locations(
  node: unknown,
  found: { kind: string; offset: number; length: number }[] = [],
) {
  if (Array.isArray(node)) {
    for (const item of node) {
      locations(item, found);
    }
  } else if (node instanceof Map) {
    for (const value of node.values()) {
      locations(value, found);
    }
  } else if (node && typeof node === "object") {
    const { kind, loc } = node as {
      kind?: string;
      loc?: { offset: number; length: number } | null;
    };
    if (loc) {
      found.push({
        kind: kind ?? "?",
        offset: Number(loc.offset),
        length: Number(loc.length),
      });
    }
    for (const value of Object.values(node)) {
      locations(value, found);
    }
  }
  return found;
}

describe("source locations", () => {
  it("should end each node at its last token", async () => {
    const files = await glob("**/*.bug", { cwd: EXAMPLES_DIR });
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await fs.readFile(path.join(EXAMPLES_DIR, file), "utf-8");
      const result = parse(source);
      if (!result.success) {
        continue;
      }

      const comments = commentSpans(source);
      for (const { kind, offset, length } of locations(result.value)) {
        const text = source.slice(offset, offset + length);
        const end = offset + length;
        const where = `${file}: ${kind} ${JSON.stringify(text)}`;

        expect(text.trim(), where).toBe(text);
        expect(
          comments.some(([start, stop]) => start < end && end <= stop),
          where,
        ).toBe(false);
      }
    }
  });
});
