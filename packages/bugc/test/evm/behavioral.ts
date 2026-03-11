/**
 * Behavioral test helper for bugc.
 *
 * Compiles BUG source, deploys bytecode, optionally calls
 * with calldata, and returns execution results for assertion.
 * No pointer dereferencing — just raw EVM state.
 */

import { compile } from "#compiler";
import { Executor } from "@ethdebug/evm";
import { bytesToHex } from "ethereum-cryptography/utils";

export interface ExecuteProgramOptions {
  /** Calldata hex string (without 0x) to send after deploy */
  calldata?: string;
  /** ETH value (wei) to send with the call */
  value?: bigint;
  /** Optimization level (default: 0) */
  optimizationLevel?: 0 | 1 | 2 | 3;
}

export interface ExecuteProgramResult {
  /** Whether deployment succeeded */
  deployed: boolean;
  /** Whether the call succeeded (undefined if no call) */
  callSuccess?: boolean;
  /** Return data from the call (empty if no call) */
  returnValue: Uint8Array;
  /** Read a storage slot as bigint */
  getStorage: (slot: bigint) => Promise<bigint>;
  /** The executor instance for advanced queries */
  executor: Executor;
}

/**
 * Compile BUG source, deploy, optionally call, and return
 * results for behavioral assertions.
 *
 * Throws if compilation fails.
 */
export async function executeProgram(
  source: string,
  options: ExecuteProgramOptions = {},
): Promise<ExecuteProgramResult> {
  const { calldata, value, optimizationLevel = 0 } = options;

  // Compile
  const result = await compile({
    to: "bytecode",
    source,
    optimizer: { level: optimizationLevel },
  });

  if (!result.success) {
    const errors = result.messages.error ?? [];
    const msgs = errors
      .map((e: { message?: string }) => e.message ?? String(e))
      .join("\n");
    throw new Error(`Compilation failed:\n${msgs}`);
  }

  const { bytecode } = result.value;
  const executor = new Executor();

  // Deploy
  const hasCreate = bytecode.create && bytecode.create.length > 0;
  const createCode = hasCreate
    ? bytesToHex(bytecode.create!)
    : bytesToHex(bytecode.runtime);

  await executor.deploy(createCode);

  let callSuccess: boolean | undefined;
  let returnValue = new Uint8Array();

  // Call if calldata provided (even empty string means "call")
  if (calldata !== undefined) {
    const execResult = await executor.execute({
      data: calldata,
      value,
    });
    callSuccess = execResult.success;
    returnValue = execResult.returnValue;
  }

  return {
    deployed: true,
    callSuccess,
    returnValue,
    getStorage: (slot: bigint) => executor.getStorage(slot),
    executor,
  };
}

/**
 * Read a uint256 from a return value at the given word offset.
 */
export function readUint256(
  returnValue: Uint8Array,
  wordOffset: number = 0,
): bigint {
  const start = wordOffset * 32;
  const end = start + 32;

  if (returnValue.length < end) {
    return 0n;
  }

  const slice = returnValue.slice(start, end);
  return BigInt("0x" + bytesToHex(slice));
}
