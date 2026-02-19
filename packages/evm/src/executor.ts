/**
 * EVM Executor
 *
 * Provides in-process EVM execution using @ethereumjs/evm.
 * Supports contract deployment, execution, and storage access.
 */

import { EVM } from "@ethereumjs/evm";
import { SimpleStateManager } from "@ethereumjs/statemanager";
import { Common, Mainnet } from "@ethereumjs/common";
import { Address, Account } from "@ethereumjs/util";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils";

import type { TraceStep, TraceHandler } from "#trace";

/**
 * Options for executing a contract call.
 */
export interface ExecutionOptions {
  /** ETH value to send with the call */
  value?: bigint;
  /** Calldata as hex string (without 0x prefix) */
  data?: string;
  /** Transaction origin address */
  origin?: Address;
  /** Caller address */
  caller?: Address;
  /** Gas limit for execution */
  gasLimit?: bigint;
}

/**
 * Result of contract execution.
 */
export interface ExecutionResult {
  /** Whether execution completed without error */
  success: boolean;
  /** Gas consumed by execution */
  gasUsed: bigint;
  /** Return data from the call */
  returnValue: Uint8Array;
  /** Event logs emitted during execution */
  logs: unknown[];
  /** Error if execution failed */
  error?: unknown;
}

interface ExecResult {
  exceptionError?: unknown;
  executionGasUsed?: bigint;
  returnValue?: Uint8Array;
  logs?: unknown[];
}

interface ResultWithExec extends ExecResult {
  execResult?: ExecResult;
}

/**
 * EVM executor for running bytecode in an isolated environment.
 *
 * Wraps @ethereumjs/evm to provide a simple interface for:
 * - Deploying contracts
 * - Executing contract calls
 * - Reading/writing storage
 * - Capturing execution traces
 */
export class Executor {
  private evm: EVM;
  private stateManager: SimpleStateManager;
  private contractAddress: Address;
  private deployerAddress: Address;

  constructor() {
    const common = new Common({
      chain: Mainnet,
      hardfork: "shanghai",
    });
    this.stateManager = new SimpleStateManager();
    this.evm = new EVM({
      common,
      stateManager: this.stateManager,
    });

    // Use a fixed contract address for testing
    this.contractAddress = new Address(
      hexToBytes("1234567890123456789012345678901234567890"),
    );

    // Use a fixed deployer address
    this.deployerAddress = new Address(
      hexToBytes("0000000000000000000000000000000000000001"),
    );
  }

  /**
   * Get the deployer address used for deployment.
   */
  getDeployerAddress(): Address {
    return this.deployerAddress;
  }

  /**
   * Get the current contract address.
   */
  getContractAddress(): Address {
    return this.contractAddress;
  }

  /**
   * Deploy bytecode and set the contract address.
   *
   * @param bytecode - Contract creation bytecode as hex string
   */
  async deploy(bytecode: string): Promise<void> {
    const code = hexToBytes(bytecode);

    // Initialize deployer account with 1 ETH
    const deployerAccount = new Account(0n, BigInt(10) ** BigInt(18));
    await this.stateManager.putAccount(this.deployerAddress, deployerAccount);

    // Initialize contract account before execution
    const contractAccount = new Account(0n, 0n);
    await this.stateManager.putAccount(this.contractAddress, contractAccount);

    // Use runCall with undefined 'to' to simulate CREATE
    const result = await this.evm.runCall({
      caller: this.deployerAddress,
      origin: this.deployerAddress,
      to: undefined,
      data: code,
      gasLimit: 10_000_000n,
      value: 0n,
    });

    const error = result.execResult?.exceptionError;

    if (error) {
      throw new Error(`Deployment failed: ${JSON.stringify(error)}`);
    }

    // Update contract address to the created one
    const createdAddress = result.createdAddress;
    if (createdAddress) {
      this.contractAddress = createdAddress;
    }
  }

  /**
   * Execute a call to the deployed contract.
   *
   * @param options - Execution options (value, data, gas, etc.)
   * @param traceHandler - Optional handler for execution trace steps
   */
  async execute(
    options: ExecutionOptions = {},
    traceHandler?: TraceHandler,
  ): Promise<ExecutionResult> {
    const runCallOpts = {
      to: this.contractAddress,
      caller: options.caller ?? this.deployerAddress,
      origin: options.origin ?? this.deployerAddress,
      data: options.data ? hexToBytes(options.data) : new Uint8Array(),
      value: options.value ?? 0n,
      gasLimit: options.gasLimit ?? 10_000_000n,
    };

    if (traceHandler) {
      this.evm.events.on(
        "step",
        (step: { pc: number; opcode: { name: string }; stack: bigint[] }) => {
          const traceStep: TraceStep = {
            pc: step.pc,
            opcode: step.opcode.name,
            stack: [...step.stack],
          };
          traceHandler(traceStep);
        },
      );
    }

    const result = await this.evm.runCall(runCallOpts);

    if (traceHandler) {
      this.evm.events.removeAllListeners("step");
    }

    const rawResult = result as ResultWithExec;
    const execResult = (rawResult.execResult || rawResult) as ExecResult;

    return {
      success: execResult.exceptionError === undefined,
      gasUsed: execResult.executionGasUsed || 0n,
      returnValue: execResult.returnValue || new Uint8Array(),
      logs: execResult.logs || [],
      error: execResult.exceptionError,
    };
  }

  /**
   * Execute bytecode directly without deployment.
   *
   * @param bytecode - Bytecode to execute as hex string
   * @param options - Execution options
   */
  async executeCode(
    bytecode: string,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const code = hexToBytes(bytecode);

    // Create a temporary account with the code
    const tempAddress = new Address(
      hexToBytes("9999999999999999999999999999999999999999"),
    );
    await this.stateManager.putCode(tempAddress, code);
    await this.stateManager.putAccount(tempAddress, new Account(0n, 0n));

    const runCodeOpts = {
      code,
      data: options.data ? hexToBytes(options.data) : new Uint8Array(),
      gasLimit: options.gasLimit ?? 10_000_000n,
      value: options.value ?? 0n,
      origin: options.origin ?? new Address(Buffer.alloc(20)),
      caller: options.caller ?? new Address(Buffer.alloc(20)),
      address: tempAddress,
    };

    const result = await this.evm.runCode(runCodeOpts);

    const rawResult = result as ResultWithExec;
    const execResult = (rawResult.execResult || rawResult) as ExecResult;

    return {
      success: execResult.exceptionError === undefined,
      gasUsed: execResult.executionGasUsed || 0n,
      returnValue: execResult.returnValue || new Uint8Array(),
      logs: execResult.logs || [],
      error: execResult.exceptionError,
    };
  }

  /**
   * Get storage value at a specific slot.
   *
   * @param slot - Storage slot as bigint
   * @returns Storage value as bigint
   */
  async getStorage(slot: bigint): Promise<bigint> {
    const slotBuffer = Buffer.alloc(32);
    const hex = slot.toString(16).padStart(64, "0");
    slotBuffer.write(hex, "hex");

    const value = await this.stateManager.getStorage(
      this.contractAddress,
      slotBuffer,
    );

    if (value.length === 0) return 0n;
    return BigInt("0x" + bytesToHex(value));
  }

  /**
   * Set storage value at a specific slot.
   *
   * @param slot - Storage slot as bigint
   * @param value - Value to store as bigint
   */
  async setStorage(slot: bigint, value: bigint): Promise<void> {
    const slotBuffer = Buffer.alloc(32);
    slotBuffer.writeBigUInt64BE(slot, 24);

    const valueBuffer = Buffer.alloc(32);
    const hex = value.toString(16).padStart(64, "0");
    valueBuffer.write(hex, "hex");

    await this.stateManager.putStorage(
      this.contractAddress,
      slotBuffer,
      valueBuffer,
    );
  }

  /**
   * Get the deployed bytecode at the contract address.
   */
  async getCode(): Promise<Uint8Array> {
    return this.stateManager.getCode(this.contractAddress);
  }

  /**
   * Reset the EVM state to a fresh instance.
   */
  async reset(): Promise<void> {
    this.stateManager = new SimpleStateManager();
    this.evm = new EVM({
      common: new Common({
        chain: Mainnet,
        hardfork: "shanghai",
      }),
      stateManager: this.stateManager,
    });
  }
}
