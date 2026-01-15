/**
 * Example Files Test Suite
 *
 * Automatically discovers and tests all .bug example files.
 *
 * Supports annotations for test behavior:
 *   // @wip                    - Skip test (work in progress)
 *   // @skip Reason            - Skip with reason
 *   // @expect-parse-error     - Expected to fail parsing
 *   // @expect-typecheck-error - Expected to fail typechecking
 *   // @expect-ir-error        - Expected to fail IR generation
 *   // @expect-bytecode-error  - Expected to fail bytecode generation
 *
 * Supports fenced YAML test blocks (see annotations.ts for format).
 */

import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import type * as Format from "@ethdebug/format";

import { bytecodeSequence, buildSequence } from "#compiler";
import { Result } from "#result";
import type { Instruction } from "#evm";

import {
  parseTestBlocks,
  type TestBlock,
  type VariablesTest,
} from "./annotations.js";
import { buildSourceMapping } from "./source-map.js";
import { runVariablesTest } from "./runners.js";

const EXAMPLES_DIR = path.resolve(__dirname, "../../examples");

interface ExampleAnnotations {
  wip: boolean;
  skip: string | false;
  expectParseError: boolean;
  expectTypecheckError: boolean;
  expectIrError: boolean;
  expectBytecodeError: boolean;
}

interface CompiledBytecode {
  runtime: Uint8Array;
  create?: Uint8Array;
  runtimeInstructions: Instruction[];
  createInstructions?: Instruction[];
  runtimeProgram: Format.Program;
  createProgram?: Format.Program;
}

interface ExampleInfo {
  relativePath: string;
  fullPath: string;
  source: string;
  annotations: ExampleAnnotations;
  testBlocks: TestBlock[];
}

// Cache for compiled examples
const compilationCache = new Map<
  string,
  { success: true; bytecode: CompiledBytecode } | { success: false }
>();

function parseAnnotations(source: string): ExampleAnnotations {
  return {
    wip: source.includes("// @wip"),
    skip: source.match(/\/\/ @skip\s*(.*)/)?.[1] || false,
    expectParseError: source.includes("// @expect-parse-error"),
    expectTypecheckError: source.includes("// @expect-typecheck-error"),
    expectIrError: source.includes("// @expect-ir-error"),
    expectBytecodeError: source.includes("// @expect-bytecode-error"),
  };
}

async function loadExamples(): Promise<ExampleInfo[]> {
  const files = await glob("**/*.bug", { cwd: EXAMPLES_DIR });
  const examples: ExampleInfo[] = [];

  for (const relativePath of files.sort()) {
    const fullPath = path.join(EXAMPLES_DIR, relativePath);
    const source = await fs.readFile(fullPath, "utf-8");

    examples.push({
      relativePath,
      fullPath,
      source,
      annotations: parseAnnotations(source),
      testBlocks: parseTestBlocks(source),
    });
  }

  return examples;
}

function shouldSkip(annotations: ExampleAnnotations): boolean {
  return annotations.wip || !!annotations.skip;
}

function skipSuffix(annotations: ExampleAnnotations): string {
  if (annotations.skip) return ` (skip: ${annotations.skip})`;
  if (annotations.wip) return " (wip)";
  return "";
}

async function compileExample(
  example: ExampleInfo,
): Promise<{ success: true; bytecode: CompiledBytecode } | { success: false }> {
  const cached = compilationCache.get(example.relativePath);
  if (cached) return cached;

  const compiler = buildSequence(bytecodeSequence);
  const result = await compiler.run({ source: example.source });

  const cacheEntry = result.success
    ? { success: true as const, bytecode: result.value.bytecode }
    : { success: false as const };

  compilationCache.set(example.relativePath, cacheEntry);
  return cacheEntry;
}

describe("Example Files", async () => {
  const examples = await loadExamples();

  // Collect variables tests
  const variablesTests: Array<{
    example: ExampleInfo;
    block: TestBlock;
    test: VariablesTest;
  }> = [];

  for (const example of examples) {
    for (const block of example.testBlocks) {
      variablesTests.push({
        example,
        block,
        test: block.parsed,
      });
    }
  }

  // === Compilation Tests ===
  describe("Compilation", () => {
    for (const example of examples) {
      const { relativePath, source, annotations } = example;
      const skip = shouldSkip(annotations);
      const itFn = skip ? it.skip : it;

      itFn(`${relativePath}${skipSuffix(annotations)}`, async () => {
        const compiler = buildSequence(bytecodeSequence);
        const result = await compiler.run({ source });

        const expectAnyError =
          annotations.expectParseError ||
          annotations.expectTypecheckError ||
          annotations.expectIrError ||
          annotations.expectBytecodeError;

        if (expectAnyError) {
          expect(result.success).toBe(false);
        } else {
          if (!result.success) {
            const errors = Result.errors(result);
            const errorMessages = errors
              .map(
                (e) => `${e.code || "ERROR"}: ${e.message || "Unknown error"}`,
              )
              .join("\n");
            expect.fail(
              `Expected compilation to succeed but got errors:\n${errorMessages}`,
            );
          }
          expect(result.success).toBe(true);

          compilationCache.set(relativePath, {
            success: true,
            bytecode: result.value.bytecode,
          });
        }
      });
    }
  });

  // === Runtime Assertions ===
  if (variablesTests.length > 0) {
    const byFile = new Map<string, typeof variablesTests>();
    for (const entry of variablesTests) {
      const key = entry.example.relativePath;
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(entry);
    }

    describe("Runtime", () => {
      for (const [relativePath, tests] of byFile) {
        const { annotations, source } = tests[0].example;
        const skip = shouldSkip(annotations);
        const describeFn = skip ? describe.skip : describe;

        describeFn(`${relativePath}${skipSuffix(annotations)}`, () => {
          for (const { example, block, test } of tests) {
            const baseName = block.name || `line ${test.atLine}`;

            // Skip tests with expectFail annotation
            if (block.expectFail) {
              it.skip(`${baseName} (known issue: ${block.expectFail})`, () => {
                // Skipped - known issue
              });
              continue;
            }

            it(baseName, async () => {
              const compiled = await compileExample(example);
              if (!compiled.success) {
                throw new Error("Compilation failed - cannot run test");
              }

              const mapping = buildSourceMapping(
                source,
                compiled.bytecode.runtimeInstructions,
              );

              const result = await runVariablesTest(
                compiled.bytecode,
                compiled.bytecode.runtimeInstructions,
                mapping,
                test,
                compiled.bytecode.runtimeProgram.context,
              );

              if (!result.passed) {
                expect.fail(result.message);
              }
            });
          }
        });
      }
    });
  }
});
