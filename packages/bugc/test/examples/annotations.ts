/**
 * Test Block Parser
 *
 * Parses fenced YAML test blocks from .bug source files.
 * Format: multi-line comment starting with @test, containing YAML.
 */

import YAML from "yaml";

export interface VariableExpectation {
  pointer?: unknown; // Expected pointer structure
  value?: string | number | bigint; // Expected dereferenced scalar value
  values?: RegionValues; // Expected values by region name
  type?: unknown; // Expected type (future use)
}

// Region values can be:
// - An object mapping region names to values/arrays
// - e.g., { length: 3, element: [100, 200, 300] }
export type RegionValues = Record<
  string,
  string | number | bigint | (string | number | bigint)[]
>;

export interface VariablesTest {
  atLine: number;
  after?: "deploy" | "call"; // When to check values (default: deploy)
  callData?: string; // Call data if after: call
  variables: Record<string, VariableExpectation>;
}

export interface TestBlock {
  name?: string;
  raw: string;
  parsed: VariablesTest;
  expectFail?: string; // If set, test is expected to fail with this reason
}

/**
 * Determine which block (create or code) contains the given offset.
 * Returns "deploy" for create block, "call" for code block.
 */
function inferAfterFromOffset(
  source: string,
  offset: number,
): "deploy" | "call" {
  // Find create { ... } and code { ... } block boundaries
  // Simple approach: find last occurrence of "create {" or "code {" before offset
  const beforeOffset = source.slice(0, offset);

  const lastCreate = beforeOffset.lastIndexOf("create {");
  const lastCode = beforeOffset.lastIndexOf("code {");

  // If we're after "code {" and it comes after "create {", we're in code block
  if (lastCode > lastCreate) {
    return "call";
  }

  // Otherwise assume create block (or default to deploy)
  return "deploy";
}

/**
 * Find the last non-empty, non-comment line before a given offset.
 * This is used for "at: here" to find the code line above the test block.
 */
function findPrecedingCodeLine(source: string, offset: number): number {
  // Get all text up to the offset
  const textBefore = source.slice(0, offset);

  // Remove all multi-line comments (including nested test blocks)
  // Replace with equivalent newlines to preserve line numbers
  const withoutBlockComments = textBefore.replace(
    /\/\*[\s\S]*?\*\//g,
    (match) => match.replace(/[^\n]/g, " "),
  );

  const lines = withoutBlockComments.split("\n");

  // Walk backwards to find the last line with actual code
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    // Skip empty lines and single-line comments
    if (line && !line.startsWith("//")) {
      return i + 1; // 1-indexed line numbers
    }
  }

  // Fallback to the line before the block
  return Math.max(1, lines.length);
}

/**
 * Remove common leading indentation from a multi-line string.
 * Also strips JSDoc-style " * " prefixes from lines.
 */
function dedent(text: string): string {
  let lines = text.split("\n");

  // Strip JSDoc-style " * " prefix from each line
  const allHaveJsdocPrefix = lines.every(
    (line) => !line.trim() || /^\s*\*\s?/.test(line),
  );
  if (allHaveJsdocPrefix) {
    lines = lines.map((line) => line.replace(/^\s*\*\s?/, ""));
  }

  // Find minimum indentation (ignoring empty lines)
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim()) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      minIndent = Math.min(minIndent, indent);
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    return lines.join("\n");
  }

  // Remove the common indentation
  return lines.map((line) => line.slice(minIndent)).join("\n");
}

/**
 * Parse all test blocks from a source file.
 */
export function parseTestBlocks(source: string): TestBlock[] {
  const blocks: TestBlock[] = [];

  // Match /*@test or /**@test style blocks
  const regex = /\/\*\*?@test\s*(\S*)?\n([\s\S]*?)\*\//g;

  let match;
  while ((match = regex.exec(source)) !== null) {
    const name = match[1] || undefined;
    const yamlContent = dedent(match[2]).trim();
    const blockStartOffset = match.index;

    try {
      const parsed = YAML.parse(yamlContent);

      // Must have (at-line or at: here) and variables
      if (!isValidTest(parsed)) {
        continue;
      }

      const expectFail = extractExpectFail(parsed);

      blocks.push({
        name,
        raw: yamlContent,
        parsed: normalizeTest(parsed, source, blockStartOffset),
        expectFail,
      });
    } catch {
      // Skip malformed test blocks
    }
  }

  return blocks;
}

function isValidTest(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;
  // Only require variables; location defaults to "here" (preceding line)
  return "variables" in obj;
}

function extractExpectFail(
  parsed: Record<string, unknown>,
): string | undefined {
  if ("fails" in parsed) {
    return typeof parsed.fails === "string" ? parsed.fails : "expected failure";
  }
  return undefined;
}

function normalizeTest(
  parsed: Record<string, unknown>,
  source: string,
  blockOffset: number,
): VariablesTest {
  // Default to preceding code line ("here" behavior)
  // Can override with explicit "at-line: N"
  const atLine =
    "at-line" in parsed
      ? (parsed["at-line"] as number)
      : findPrecedingCodeLine(source, blockOffset);

  // Default "after" based on which block the test is in
  // create {} -> deploy, code {} -> call
  const after =
    "after" in parsed
      ? (parsed.after as "deploy" | "call")
      : inferAfterFromOffset(source, blockOffset);

  return {
    atLine,
    after,
    callData: parsed["call-data"] as string | undefined,
    variables: parsed.variables as Record<string, VariableExpectation>,
  };
}
