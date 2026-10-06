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

import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { glob } from "glob";
import * as Format from "@ethdebug/format";
import {
  addSchema,
  validate,
  type Validator,
} from "@hyperjump/json-schema/draft-2020-12";
import { BASIC } from "@hyperjump/json-schema/experimental";

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

for (const schema of Object.values(Format.schemas)) {
  // @ts-expect-error describeSchema's JSONSchema type is not hyperjump's
  addSchema(schema);
}

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

// Each instruction's context is a $ref to the context schema, so it
// validates on its own. Most contexts repeat, across a program's
// instructions and across optimization levels, and contexts make up
// nearly all of a program's size. So validate each distinct context
// once, and validate the rest of the program without them.
const contextErrors = new Map<string, string[]>();

async function invalidLocations(
  schema: string,
  value: Parameters<Validator>[0],
): Promise<string[]> {
  const output = await validate(schema, value, BASIC);
  return output.valid
    ? []
    : (output.errors ?? []).map((e) => e.instanceLocation);
}

async function invalidProgramLocations(
  program: Format.Program,
): Promise<string[]> {
  // validate the program as it is written out, as JSON
  const { instructions, ...rest } = JSON.parse(JSON.stringify(program));
  const invalid = await invalidLocations("schema:ethdebug/format/program", {
    ...rest,
    instructions: instructions.map(
      ({ context: _, ...instruction }: Format.Program.Instruction) =>
        instruction,
    ),
  });

  for (const [index, { context }] of instructions.entries()) {
    if (context === undefined) continue;
    const key = JSON.stringify(context);
    let errors = contextErrors.get(key);
    if (!errors) {
      errors = await invalidLocations(
        "schema:ethdebug/format/program/context",
        context,
      );
      contextErrors.set(key, errors);
    }
    invalid.push(
      ...errors.map(
        (location) => `#/instructions/${index}/context${location.slice(1)}`,
      ),
    );
  }

  return invalid;
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

// The compiler and the schema validator do all their work synchronously,
// so this file can run start to end without the event loop ever turning.
// The worker then cannot read vitest's replies to its progress reports,
// and once that lasts a minute, vitest fails the run with 'Timeout
// calling "onTaskUpdate"'. Give the event loop a turn after each test.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));

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

  // === Program Validity ===
  describe("Program validity", () => {
    for (const example of examples) {
      const { relativePath, source, annotations } = example;
      const expectAnyError =
        annotations.expectParseError ||
        annotations.expectTypecheckError ||
        annotations.expectIrError ||
        annotations.expectBytecodeError;
      const skip = shouldSkip(annotations) || expectAnyError;
      const itFn = skip ? it.skip : it;

      for (const level of [0, 1, 2, 3] as const) {
        itFn(
          `${relativePath} at O${level}`,
          async () => {
            const compiler = buildSequence(bytecodeSequence);
            const result = await compiler.run({
              source,
              optimizer: { level },
            });
            if (!result.success) {
              expect.fail(`Compilation failed at O${level}`);
            }

            const { runtimeProgram, createProgram } = result.value.bytecode;
            const storageNames = (result.value.ast.storage ?? []).map(
              ({ name }) => name,
            );
            for (const program of [runtimeProgram, createProgram]) {
              if (!program) continue;
              expect(await invalidProgramLocations(program)).toEqual([]);

              // every storage variable is in the program-level context
              const { context } = program;
              const identifiers =
                context && Format.Program.Context.isVariables(context)
                  ? context.variables.map(({ identifier }) => identifier)
                  : [];
              expect(identifiers).toEqual(storageNames);
            }
            // A program lists its locals at every instruction, so a long
            // one takes a while to validate
          },
          10_000,
        );
      }
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
