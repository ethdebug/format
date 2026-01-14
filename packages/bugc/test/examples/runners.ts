/**
 * Test Runner
 *
 * Execute variable tests against compiled bytecode.
 * Checks pointer structure and/or dereferenced values at source lines.
 */

import type * as Evm from "#evm";
import * as Format from "@ethdebug/format";
import { dereference } from "@ethdebug/pointers";
import { bytesToHex } from "ethereum-cryptography/utils";

import { EvmExecutor } from "../evm/index.js";
import type { VariablesTest } from "./annotations.js";
import type { SourceMapping } from "./source-map.js";
import { findInstructionsAtLine } from "./source-map.js";
import { createMachineState } from "./machine-adapter.js";

export interface TestResult {
  passed: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/**
 * Run a variables test: check pointer structure and/or dereferenced values.
 */
export async function runVariablesTest(
  bytecode: { runtime: Uint8Array; create?: Uint8Array },
  instructions: Evm.Instruction[],
  sourceMapping: SourceMapping,
  test: VariablesTest,
  programContext?: Format.Program.Context,
): Promise<TestResult> {
  // Collect variables from program-level context first (storage variables)
  const variables = new Map<string, Format.Pointer>();

  if (programContext) {
    const vars = extractVariables(programContext);
    for (const v of vars) {
      if (v.identifier && v.pointer) {
        variables.set(v.identifier, v.pointer);
      }
    }
  }

  // Find instructions at the source line and augment with local variables
  const instrIndices = findInstructionsAtLine(sourceMapping, test.atLine);

  for (const idx of instrIndices) {
    const instr = instructions[idx];
    const context = instr.debug?.context;

    if (!context) {
      continue;
    }

    const vars = extractVariables(context);
    for (const v of vars) {
      if (v.identifier && v.pointer) {
        variables.set(v.identifier, v.pointer);
      }
    }
  }

  // Check each expected variable
  for (const [name, expected] of Object.entries(test.variables)) {
    const pointer = variables.get(name);

    if (!pointer) {
      return {
        passed: false,
        message: `Variable "${name}" not found at line ${test.atLine}`,
      };
    }

    // Check pointer structure if specified
    if (expected.pointer !== undefined) {
      const match = deepEqual(pointer, expected.pointer);
      if (!match) {
        return {
          passed: false,
          message:
            `Variable "${name}" pointer mismatch\n` +
            `  expected: ${JSON.stringify(expected.pointer)}\n` +
            `  actual:   ${JSON.stringify(pointer)}`,
          expected: expected.pointer,
          actual: pointer,
        };
      }
    }

    // Check dereferenced value if specified (scalar - first region)
    if (expected.value !== undefined) {
      const result = await checkScalarValue(
        bytecode,
        pointer,
        name,
        expected.value,
        test.after,
        test.callData,
      );
      if (!result.passed) {
        return result;
      }
    }

    // Check dereferenced values by region name if specified
    if (expected.values !== undefined) {
      const result = await checkRegionValues(
        bytecode,
        pointer,
        name,
        expected.values,
        test.after,
        test.callData,
      );
      if (!result.passed) {
        return result;
      }
    }
  }

  return { passed: true };
}

/**
 * Deploy contract and check a scalar value (first region).
 */
async function checkScalarValue(
  bytecode: { runtime: Uint8Array; create?: Uint8Array },
  pointer: Format.Pointer,
  name: string,
  expectedValue: string | number | bigint,
  after: "deploy" | "call" = "deploy",
  callData?: string,
): Promise<TestResult> {
  const executor = new EvmExecutor();

  try {
    // Deploy
    const hasCreate = bytecode.create && bytecode.create.length > 0;
    const createCode = hasCreate
      ? toHex(bytecode.create!)
      : toHex(bytecode.runtime);
    await executor.deploy(createCode);

    // Call if needed
    if (after === "call") {
      const execResult = await executor.execute({ data: callData || "" });
      if (!execResult.success) {
        return {
          passed: false,
          message: `Execution failed: ${JSON.stringify(execResult.error)}`,
        };
      }
    }

    // Dereference the pointer
    const state = createMachineState(executor);
    const cursor = await dereference(pointer, { state });
    const view = await cursor.view(state);

    if (view.regions.length === 0) {
      return {
        passed: false,
        message: `No regions for pointer of variable "${name}"`,
      };
    }

    const data = await view.read(view.regions[0]);
    const actual = data.asUint();
    const expected = BigInt(expectedValue);

    if (actual !== expected) {
      return {
        passed: false,
        message: `Variable "${name}": expected ${expected}, got ${actual}`,
        expected,
        actual,
      };
    }

    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      message:
        `Failed to evaluate "${name}": ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Deploy contract and check values by region name.
 * values is an object like { length: 3, element: [100, 200, 300] }
 */
async function checkRegionValues(
  bytecode: { runtime: Uint8Array; create?: Uint8Array },
  pointer: Format.Pointer,
  varName: string,
  expectedValues: Record<
    string,
    string | number | bigint | (string | number | bigint)[]
  >,
  after: "deploy" | "call" = "deploy",
  callData?: string,
): Promise<TestResult> {
  const executor = new EvmExecutor();

  try {
    // Deploy
    const hasCreate = bytecode.create && bytecode.create.length > 0;
    const createCode = hasCreate
      ? toHex(bytecode.create!)
      : toHex(bytecode.runtime);
    await executor.deploy(createCode);

    // Call if needed
    if (after === "call") {
      const execResult = await executor.execute({ data: callData || "" });
      if (!execResult.success) {
        return {
          passed: false,
          message: `Execution failed: ${JSON.stringify(execResult.error)}`,
        };
      }
    }

    // Dereference the pointer
    const state = createMachineState(executor);
    const cursor = await dereference(pointer, { state });
    const view = await cursor.view(state);

    // Check each expected region
    for (const [regionName, expectedValue] of Object.entries(expectedValues)) {
      const regions = view.regions.named(regionName);

      if (regions.length === 0) {
        return {
          passed: false,
          message: `Variable "${varName}": no regions named "${regionName}"`,
        };
      }

      if (Array.isArray(expectedValue)) {
        // Check multiple regions with same name
        if (regions.length !== expectedValue.length) {
          return {
            passed: false,
            message:
              `Variable "${varName}.${regionName}": expected ` +
              `${expectedValue.length} regions, got ${regions.length}`,
          };
        }

        for (let i = 0; i < expectedValue.length; i++) {
          const data = await view.read(regions[i]);
          const actual = data.asUint();
          const expected = BigInt(expectedValue[i]);

          if (actual !== expected) {
            return {
              passed: false,
              message:
                `Variable "${varName}.${regionName}[${i}]": ` +
                `expected ${expected}, got ${actual}`,
              expected,
              actual,
            };
          }
        }
      } else {
        // Check single region
        const data = await view.read(regions[0]);
        const actual = data.asUint();
        const expected = BigInt(expectedValue);

        if (actual !== expected) {
          return {
            passed: false,
            message:
              `Variable "${varName}.${regionName}": ` +
              `expected ${expected}, got ${actual}`,
            expected,
            actual,
          };
        }
      }
    }

    return { passed: true };
  } catch (error) {
    return {
      passed: false,
      message:
        `Failed to evaluate "${varName}": ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extract variables from a context (handles gather/pick/variables variants).
 */
function extractVariables(
  context: Format.Program.Context,
): Format.Program.Context.Variables.Variable[] {
  const result: Format.Program.Context.Variables.Variable[] = [];

  if (Format.Program.Context.isVariables(context)) {
    result.push(...context.variables);
  }

  if (Format.Program.Context.isGather(context)) {
    for (const child of context.gather) {
      result.push(...extractVariables(child));
    }
  }

  if (Format.Program.Context.isPick(context)) {
    for (const option of context.pick) {
      result.push(...extractVariables(option));
    }
  }

  return result;
}

/**
 * Deep equality check for pointer structures.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a !== "object" || a === null || b === null) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}
