/**
 * EVM Executor
 *
 * Provides in-process EVM execution using @ethereumjs/evm.
 * Supports contract deployment, execution, and storage access.
 */

import { EVM } from "@ethereumjs/evm";
import type { InterpreterStep, Message } from "@ethereumjs/evm";
import { SimpleStateManager } from "@ethereumjs/statemanager";
import {
  Common,
  Hardfork,
  Mainnet,
  createCustomCommon,
} from "@ethereumjs/common";
import { Address, Account } from "@ethereumjs/util";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils";

import type {
  TraceStep,
  TraceHandler,
  TraceOptions,
  MessageFrame,
} from "#trace";

/**
 * Hardfork used for execution. Current solc targets prague by default,
 * so this must be at least cancun (MCOPY, TLOAD, TSTORE, ...).
 */
const hardfork = Hardfork.Prague;

const defaultGasLimit = 10_000_000n;

/**
 * Options for creating an executor.
 */
export interface ExecutorOptions {
  /** Chain id (what CHAINID returns); default 1 */
  chainId?: bigint;
}

/**
 * The block a call runs in. Fields left out are zero, except
 * `gasLimit` (30,000,000).
 */
export interface BlockOptions {
  number?: bigint;
  timestamp?: bigint;
  /** PREVRANDAO, as a number or 32-byte hex */
  prevrandao?: bigint | string;
  /** COINBASE, as hex */
  coinbase?: string;
  /** BASEFEE */
  baseFee?: bigint;
  /** GASLIMIT */
  gasLimit?: bigint;
}

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
  /** Block to run in (default: a block whose fields are all zero) */
  block?: BlockOptions;
}

/**
 * Options for a transaction that creates a contract.
 */
export interface DeployOptions {
  /** Sender (and origin), as hex */
  from: string;
  /** Creation bytecode (with constructor arguments), as hex */
  create: string;
  value?: bigint;
  gasLimit?: bigint;
  block?: BlockOptions;
}

/**
 * Options for a transaction that calls an address.
 */
export interface CallOptions {
  /** Sender (and origin), as hex */
  from: string;
  /** Called address, as hex */
  to: string;
  /** Calldata, as hex */
  input?: string;
  value?: bigint;
  gasLimit?: bigint;
  block?: BlockOptions;
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

/**
 * Result of a transaction that creates a contract.
 */
export interface DeployResult extends ExecutionResult {
  /** The new contract's address (absent when creation failed) */
  address?: string;
}

interface ExecResult {
  exceptionError?: unknown;
  executionGasUsed?: bigint;
  returnValue?: Uint8Array;
  logs?: unknown[];
}

interface ResultWithExec extends ExecResult {
  execResult?: ExecResult;
  createdAddress?: Address;
}

type RunCallOpts = Parameters<EVM["runCall"]>[0];

/**
 * EVM executor for running bytecode in an isolated environment.
 *
 * Wraps @ethereumjs/evm to provide a simple interface for:
 * - Funding accounts
 * - Deploying contracts and calling them, as transactions from any
 *   account, in a given block
 * - Reading/writing storage
 * - Capturing execution traces and message frames
 *
 * The "current contract" is the one deployed last; `execute`,
 * `getStorage`, `setStorage` and `getCode` use it by default.
 */
export class Executor {
  private evm: EVM;
  private stateManager: SimpleStateManager;
  private contractAddress: Address;
  private deployerAddress: Address;
  private options: ExecutorOptions;

  constructor(options: ExecutorOptions = {}) {
    this.options = options;
    this.stateManager = new SimpleStateManager();
    this.evm = this.createEvm();

    // Use a fixed contract address for testing
    this.contractAddress = new Address(
      hexToBytes("1234567890123456789012345678901234567890"),
    );

    // Use a fixed deployer address
    this.deployerAddress = new Address(
      hexToBytes("0000000000000000000000000000000000000001"),
    );
  }

  private createEvm(): EVM {
    const { chainId } = this.options;
    const common =
      chainId === undefined
        ? new Common({ chain: Mainnet, hardfork })
        : createCustomCommon({ chainId: Number(chainId) }, Mainnet, {
            hardfork,
          });
    return new EVM({ common, stateManager: this.stateManager });
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
   * Set an account's balance (keeping its nonce).
   */
  async fund(address: string, balance: bigint): Promise<void> {
    const at = toAddress(address);
    const account = (await this.stateManager.getAccount(at)) ?? new Account();
    account.balance = balance;
    await this.stateManager.putAccount(at, account);
  }

  /**
   * Deploy bytecode from the fixed deployer and make it the current
   * contract. Throws when creation fails.
   *
   * @param bytecode - Contract creation bytecode as hex string
   */
  async deploy(bytecode: string): Promise<void>;
  /**
   * Send a transaction that creates a contract, and make the contract
   * the current contract. Ends the transaction (see `endTransaction`).
   */
  async deploy(
    options: DeployOptions,
    trace?: TraceOptions | TraceHandler,
  ): Promise<DeployResult>;
  async deploy(
    options: string | DeployOptions,
    trace?: TraceOptions | TraceHandler,
  ): Promise<void | DeployResult> {
    if (typeof options === "string") {
      return this.deployFromDeployer(options);
    }

    const from = toAddress(options.from);
    const raw = await this.run(
      {
        caller: from,
        origin: from,
        to: undefined,
        data: hexToBytes(options.create),
        value: options.value ?? 0n,
        gasLimit: options.gasLimit ?? defaultGasLimit,
        block: toBlock(options.block),
      },
      trace,
    );
    await this.endTransaction();

    const result = toExecutionResult(raw);
    if (!result.success || !raw.createdAddress) {
      return result;
    }
    this.contractAddress = raw.createdAddress;
    return { ...result, address: raw.createdAddress.toString() };
  }

  private async deployFromDeployer(bytecode: string): Promise<void> {
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
      gasLimit: defaultGasLimit,
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
   * Send a transaction that calls an address. Ends the transaction
   * (see `endTransaction`).
   */
  async call(
    options: CallOptions,
    trace?: TraceOptions | TraceHandler,
  ): Promise<ExecutionResult> {
    const from = toAddress(options.from);
    const raw = await this.run(
      {
        caller: from,
        origin: from,
        to: toAddress(options.to),
        data: options.input ? hexToBytes(options.input) : new Uint8Array(),
        value: options.value ?? 0n,
        gasLimit: options.gasLimit ?? defaultGasLimit,
        block: toBlock(options.block),
      },
      trace,
    );
    await this.endTransaction();
    return toExecutionResult(raw);
  }

  /**
   * End the transaction: clear transient storage and the warm address
   * and slot sets, and remove touched empty accounts (EIP-161), as at
   * a real transaction boundary. `deploy(options)` and `call` do this;
   * `execute` does not.
   */
  async endTransaction(): Promise<void> {
    this.evm.transientStorage.clear();
    await this.evm.journal.cleanup();
  }

  /**
   * Execute a call to the current contract.
   *
   * @param options - Execution options (value, data, gas, etc.)
   * @param trace - Optional handler for execution trace steps, or
   *   trace options
   */
  async execute(
    options: ExecutionOptions = {},
    trace?: TraceOptions | TraceHandler,
  ): Promise<ExecutionResult> {
    const raw = await this.run(
      {
        to: this.contractAddress,
        caller: options.caller ?? this.deployerAddress,
        origin: options.origin ?? this.deployerAddress,
        data: options.data ? hexToBytes(options.data) : new Uint8Array(),
        value: options.value ?? 0n,
        gasLimit: options.gasLimit ?? defaultGasLimit,
        block: toBlock(options.block),
      },
      trace,
    );
    return toExecutionResult(raw);
  }

  /**
   * Run one message from outside, reporting its steps and frames.
   */
  private async run(
    opts: RunCallOpts,
    trace?: TraceOptions | TraceHandler,
  ): Promise<ResultWithExec> {
    const options: TraceOptions =
      typeof trace === "function" ? { step: trace } : (trace ?? {});
    if (!options.step && !options.frame) {
      return (await this.evm.runCall(opts)) as ResultWithExec;
    }

    const { events } = this.evm;
    const frames: MessageFrame[] = [];
    const memories: (Uint8Array | undefined)[] = [];
    const lastOpcodes: number[] = [];
    const policy = options.memory ?? "full";
    const evm = this.evm as unknown as {
      _generateAddress(message: Message): Promise<Address>;
    };

    const beforeMessage = (message: Message, resolve?: () => void) => {
      void (async () => {
        try {
          const create = message.to === undefined;
          const address = create
            ? await evm._generateAddress(message)
            : message.to!;
          const frame: MessageFrame = {
            depth: message.depth,
            address: address.toString(),
            codeAddress: create
              ? address.toString()
              : message.codeAddress.toString(),
            caller: message.caller.toString(),
            calldata: create ? new Uint8Array() : message.data,
            ...(create ? { initcode: message.data } : {}),
            value: message.value,
            create,
            delegatecall: message.delegatecall,
            static: message.isStatic,
          };
          frames.push(frame);
          memories[message.depth] = undefined;
          options.frame?.({ kind: "enter", frame });
        } finally {
          resolve?.();
        }
      })();
    };

    const afterMessage = (result: ResultWithExec) => {
      const frame = frames.pop();
      if (!frame || !options.frame) {
        return;
      }
      const exec = result.execResult ?? result;
      const error = exec.exceptionError as { error?: string } | undefined;
      options.frame({
        kind: "exit",
        frame,
        returnData: exec.returnValue ?? new Uint8Array(),
        reverted: error !== undefined,
        ...(error ? { error: String(error.error ?? error) } : {}),
      });
    };

    const step = options.step
      ? (interpreterStep: InterpreterStep) => {
          const { depth, opcode } = interpreterStep;
          const frame = frames[frames.length - 1];
          let memory: Uint8Array | undefined;
          if (policy === "full") {
            memory = new Uint8Array(interpreterStep.memory);
          } else if (policy === "changed") {
            memory = shareMemory(
              memories[depth],
              lastOpcodes[depth],
              interpreterStep.memory,
            );
            memories[depth] = memory;
            lastOpcodes[depth] = opcode.code;
          }
          const traceStep: TraceStep = {
            pc: interpreterStep.pc,
            opcode: opcode.name,
            stack: [...interpreterStep.stack],
            ...(memory ? { memory } : {}),
            gasRemaining: interpreterStep.gasLeft,
            gasCost: BigInt(opcode.fee) + (opcode.dynamicFee ?? 0n),
            depth,
            address: frame?.address,
            codeAddress: frame?.codeAddress,
          };
          options.step!(traceStep);
        }
      : undefined;

    events.on("beforeMessage", beforeMessage);
    events.on("afterMessage", afterMessage);
    if (step) {
      events.on("step", step);
    }
    try {
      return (await this.evm.runCall(opts)) as ResultWithExec;
    } finally {
      events.removeListener("beforeMessage", beforeMessage);
      events.removeListener("afterMessage", afterMessage);
      if (step) {
        events.removeListener("step", step);
      }
    }
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
      gasLimit: options.gasLimit ?? defaultGasLimit,
      value: options.value ?? 0n,
      origin: options.origin ?? new Address(hexToBytes("00".repeat(20))),
      caller: options.caller ?? new Address(hexToBytes("00".repeat(20))),
      address: tempAddress,
      block: toBlock(options.block),
    };

    const result = await this.evm.runCode(runCodeOpts);
    return toExecutionResult(result as ResultWithExec);
  }

  /**
   * Get storage value at a specific slot.
   *
   * @param slot - Storage slot as bigint
   * @param address - Contract address as hex (default: the current
   *   contract)
   * @returns Storage value as bigint
   */
  async getStorage(slot: bigint, address?: string): Promise<bigint> {
    const value = await this.stateManager.getStorage(
      address ? toAddress(address) : this.contractAddress,
      toWord(slot),
    );

    if (value.length === 0) return 0n;
    return BigInt("0x" + bytesToHex(value));
  }

  /**
   * Set storage value at a specific slot.
   *
   * @param slot - Storage slot as bigint
   * @param value - Value to store as bigint
   * @param address - Contract address as hex (default: the current
   *   contract)
   */
  async setStorage(
    slot: bigint,
    value: bigint,
    address?: string,
  ): Promise<void> {
    await this.stateManager.putStorage(
      address ? toAddress(address) : this.contractAddress,
      toWord(slot),
      toWord(value),
    );
  }

  /**
   * Get the deployed bytecode at an address (default: the current
   * contract).
   */
  async getCode(address?: string): Promise<Uint8Array> {
    return this.stateManager.getCode(
      address ? toAddress(address) : this.contractAddress,
    );
  }

  /**
   * Reset the EVM state to a fresh instance.
   */
  async reset(): Promise<void> {
    this.stateManager = new SimpleStateManager();
    this.evm = this.createEvm();
  }
}

/**
 * Opcodes after which a frame's memory may differ: they write memory
 * or expand it.
 */
const memoryOpcodes = new Set([
  0x20, // KECCAK256
  0x37, // CALLDATACOPY
  0x39, // CODECOPY
  0x3c, // EXTCODECOPY
  0x3e, // RETURNDATACOPY
  0x51, // MLOAD
  0x52, // MSTORE
  0x53, // MSTORE8
  0x5e, // MCOPY
  0xa0, // LOG0..LOG4
  0xa1,
  0xa2,
  0xa3,
  0xa4,
  0xf0, // CREATE
  0xf1, // CALL
  0xf2, // CALLCODE
  0xf4, // DELEGATECALL
  0xf5, // CREATE2
  0xfa, // STATICCALL
]);

/**
 * The frame's previous memory copy when memory has not changed since
 * then; otherwise a new copy.
 */
function shareMemory(
  previous: Uint8Array | undefined,
  previousOpcode: number | undefined,
  current: Uint8Array,
): Uint8Array {
  if (
    previous &&
    previous.length === current.length &&
    (!memoryOpcodes.has(previousOpcode!) || equalBytes(previous, current))
  ) {
    return previous;
  }
  return new Uint8Array(current);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toAddress(hex: string): Address {
  return new Address(hexToBytes(hex));
}

function toWord(value: bigint): Uint8Array {
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function toBlock(block?: BlockOptions): RunCallOpts["block"] {
  if (!block) {
    return undefined;
  }
  const { prevrandao = 0n } = block;
  return {
    header: {
      number: block.number ?? 0n,
      coinbase: toAddress(block.coinbase ?? "00".repeat(20)),
      timestamp: block.timestamp ?? 0n,
      difficulty: 0n,
      prevRandao:
        typeof prevrandao === "bigint"
          ? toWord(prevrandao)
          : hexToBytes(prevrandao),
      gasLimit: block.gasLimit ?? 30_000_000n,
      baseFeePerGas: block.baseFee ?? 0n,
      getBlobGasPrice: () => undefined,
    },
  };
}

function toExecutionResult(raw: ResultWithExec): ExecutionResult {
  const execResult = (raw.execResult || raw) as ExecResult;
  return {
    success: execResult.exceptionError === undefined,
    gasUsed: execResult.executionGasUsed || 0n,
    returnValue: execResult.returnValue || new Uint8Array(),
    logs: execResult.logs || [],
    error: execResult.exceptionError,
  };
}
