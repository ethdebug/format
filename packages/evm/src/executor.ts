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
import {
  Address,
  Account,
  generateAddress,
  generateAddress2,
  bigIntToBytes,
} from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils";

import { recorder } from "#trace";
import type {
  TraceStep,
  TraceHandler,
  TraceOptions,
  MessageFrame,
  FrameEvent,
  Trace,
  Recorder,
  StepState,
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
 * `gasLimit` (30,000,000) and `blobBaseFee` (1). BLOCKHASH of block
 * `n` (one of the 256 blocks before `number`) is keccak256 of `n` as a
 * 32-byte word.
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
  /** BLOBBASEFEE */
  blobBaseFee?: bigint;
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
  /**
   * Block to run in. Without it, the block's fields are all zero, and
   * BASEFEE and BLOBBASEFEE fail (the block has neither)
   */
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
  /** Changes whenever storage may have changed */
  private version = 0;

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
    return new EVM({
      common,
      stateManager: this.stateManager,
      blockchain: blockchain(),
    });
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
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
  ): Promise<DeployResult>;
  async deploy(
    options: string | DeployOptions,
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
  ): Promise<void | DeployResult> {
    if (typeof options === "string") {
      return this.deployFromDeployer(options);
    }

    const from = toAddress(options.from);
    const raw = await this.transaction(
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
    const result = await this.run({
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
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
  ): Promise<ExecutionResult> {
    const from = toAddress(options.from);
    const raw = await this.transaction(
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
    return toExecutionResult(raw);
  }

  private async transaction(
    opts: RunCallOpts,
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
  ): Promise<ResultWithExec> {
    try {
      return await this.run(opts, trace);
    } finally {
      await this.endTransaction();
    }
  }

  /**
   * End the transaction: clear transient storage, the warm address
   * and slot sets and the original storage values (EIP-2200), and
   * remove touched empty accounts (EIP-161), as at a transaction
   * boundary. `deploy(options)` and `call` do this; `execute` does
   * not.
   *
   * Gas still differs from a chain's: no intrinsic gas is charged,
   * and the sender, recipient, precompiles and COINBASE are not warm
   * at the start.
   */
  async endTransaction(): Promise<void> {
    this.evm.transientStorage.clear();
    this.stateManager.originalStorageCache.clear();
    await this.evm.journal.cleanup();
  }

  /**
   * The executor's state now, as a step state: storage and code of
   * the given contract (default: the current contract), read live,
   * with an empty stack, memory, calldata and return data. Use this
   * only to read the present; a trace gives the state at its steps.
   */
  async currentState(address?: string): Promise<StepState> {
    const at = address ?? this.contractAddress.toString();
    return {
      stack: [],
      memory: new Uint8Array(),
      storage: (slot) => this.getStorage(slot, at),
      transient: async (slot) =>
        toBigInt(this.evm.transientStorage.get(toAddress(at), toWord(slot))),
      calldata: new Uint8Array(),
      returndata: new Uint8Array(),
      code: await this.getCode(at),
    };
  }

  /**
   * Execute a call to the current contract.
   *
   * @param options - Execution options (value, data, gas, etc.)
   * @param trace - Optional handler for execution trace steps, trace
   *   handlers, or a trace to record (see `createTrace`)
   */
  async execute(
    options: ExecutionOptions = {},
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
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
   *
   * Handler errors do not stop the EVM mid-instruction: the first one
   * is kept, no handler runs after it, and the run rejects with it.
   */
  private async run(
    opts: RunCallOpts,
    trace?: TraceOptions | TraceHandler | Trace<unknown>,
  ): Promise<ResultWithExec> {
    this.version++;
    const record: Recorder | undefined =
      trace && recorder in trace ? trace[recorder] : undefined;
    if (record?.started) {
      throw new Error("a trace records one transaction");
    }
    const options: TraceOptions =
      typeof trace === "function"
        ? { step: trace }
        : record
          ? {}
          : ((trace as TraceOptions | undefined) ?? {});

    if (!record && !options.step && !options.frame) {
      return this.runCall(opts);
    }

    const { events } = this.evm;
    const stateManager = this.stateManager;
    const frames: MessageFrame[] = [];
    let index = 0;
    let failure: { error: unknown } | undefined;
    const guard = (action: () => void) => {
      if (failure) return;
      try {
        action();
      } catch (error) {
        failure = { error };
      }
    };

    const enter = async (message: Message): Promise<void> => {
      const create = message.to === undefined;
      // ethereumjs moves the init code from `data` to `code` only
      // after this event
      const initcode = create
        ? message.code instanceof Uint8Array
          ? message.code
          : message.data
        : undefined;
      const address = create
        ? await createdAddress(stateManager, message, initcode!)
        : message.to!;
      const codeAddress = create ? address : message.codeAddress;
      const frame: MessageFrame = {
        depth: message.depth,
        address: address.toString(),
        codeAddress: codeAddress.toString(),
        caller: message.caller.toString(),
        calldata: create ? new Uint8Array() : message.data,
        ...(create ? { initcode } : {}),
        value: message.value,
        create,
        delegatecall: message.delegatecall,
        static: message.isStatic,
      };
      frames.push(frame);
      const code = create
        ? initcode!
        : record
          ? await stateManager.getCode(codeAddress)
          : undefined;
      guard(() => {
        if (record) record.enter(frame, code!);
        else options.frame?.({ kind: "enter", frame, first: index });
      });
    };

    const beforeMessage = (message: Message, resolve?: () => void) => {
      enter(message)
        .catch((error) => {
          failure ??= { error };
        })
        .finally(() => resolve?.());
    };

    const afterMessage = (result: ResultWithExec) => {
      const frame = frames.pop();
      if (!frame) return;
      const exec = result.execResult ?? result;
      const error = exec.exceptionError as { error?: string } | undefined;
      const event: FrameEvent & { kind: "exit" } = {
        kind: "exit",
        frame,
        last: index - 1,
        returnData: exec.returnValue ?? new Uint8Array(),
        reverted: error !== undefined,
        ...(error ? { error: String(error.error ?? error) } : {}),
      };
      guard(() => {
        if (record) record.exit(event);
        else options.frame?.(event);
      });
    };

    const report = (interpreterStep: InterpreterStep) => {
      const { depth, opcode } = interpreterStep;
      const frame = frames[frames.length - 1];
      const traceStep: TraceStep = {
        pc: interpreterStep.pc,
        opcode: opcode.name,
        op: opcode.code,
        // ethereumjs gives the step's whole cost as `dynamicFee`
        gasCost: opcode.dynamicFee ?? BigInt(opcode.fee),
        gasRemaining: interpreterStep.gasLeft,
        depth,
        address: frame.address,
        codeAddress: frame.codeAddress,
      };
      guard(() => {
        if (record) {
          record.step(traceStep, interpreterStep.stack, interpreterStep.memory);
        } else {
          options.step?.(traceStep, index);
        }
      });
      index++;
    };

    // A recorded trace needs a slot's value just before SLOAD and
    // SSTORE, which takes an asynchronous read
    const step = record
      ? (interpreterStep: InterpreterStep, resolve?: () => void) => {
          const { opcode, stack, address } = interpreterStep;
          if (failure || (opcode.code !== 0x54 && opcode.code !== 0x55)) {
            report(interpreterStep);
            resolve?.();
            return;
          }
          const slot = stack[stack.length - 1];
          stateManager
            .getStorage(address, toWord(slot))
            .then((value) => {
              guard(() =>
                record.observe(address.toString(), slot, toBigInt(value)),
              );
              report(interpreterStep);
            })
            .catch((error) => {
              failure ??= { error };
            })
            .finally(() => resolve?.());
        }
      : report;

    events.on("beforeMessage", beforeMessage);
    events.on("afterMessage", afterMessage);
    if (record || options.step) {
      events.on("step", step);
    }
    let result: ResultWithExec;
    try {
      result = await this.runCall(opts);
    } finally {
      events.removeListener("beforeMessage", beforeMessage);
      events.removeListener("afterMessage", afterMessage);
      events.removeListener("step", step);
    }
    if (failure) {
      throw failure.error;
    }
    if (record) {
      const version = this.version;
      record.end(async (address, slot) => {
        if (this.version !== version) {
          throw new Error(
            `slot ${slot} of ${address} was not touched by the trace's ` +
              "transaction, and the executor has changed since",
          );
        }
        return this.getStorage(slot, address);
      });
    }
    return result;
  }

  /**
   * `runCall`, undoing the open checkpoints if it throws (as, without
   * a block, BASEFEE does)
   */
  private async runCall(opts: RunCallOpts): Promise<ResultWithExec> {
    this.version++;
    try {
      return (await this.evm.runCall(opts)) as ResultWithExec;
    } catch (error) {
      const journal = this.evm.journal as unknown as {
        journalHeight: number;
        revert(): Promise<void>;
      };
      while (journal.journalHeight > 0) {
        await journal.revert();
        this.evm.transientStorage.revert();
      }
      throw error;
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

    this.version++;
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
    return toBigInt(value);
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
    this.version++;
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
    this.version++;
    this.stateManager = new SimpleStateManager();
    this.evm = this.createEvm();
  }
}

/**
 * The address a create message deploys to
 */
async function createdAddress(
  stateManager: SimpleStateManager,
  message: Message,
  initcode: Uint8Array,
): Promise<Address> {
  if (message.salt) {
    return new Address(
      generateAddress2(message.caller.bytes, message.salt, initcode),
    );
  }
  // the sender's nonce is already incremented
  const account = await stateManager.getAccount(message.caller);
  const nonce = (account?.nonce ?? 1n) - 1n;
  return new Address(
    generateAddress(message.caller.bytes, bigIntToBytes(nonce)),
  );
}

/**
 * Block hashes for BLOCKHASH: keccak256 of the block number as a word
 */
function blockchain() {
  const chain = {
    async getBlock(number: number) {
      return { hash: () => keccak256(toWord(BigInt(number))) };
    },
    async putBlock() {},
    shallowCopy: () => chain,
  };
  return chain;
}

function toAddress(hex: string): Address {
  return new Address(hexToBytes(hex));
}

function toWord(value: bigint): Uint8Array {
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function toBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt("0x" + bytesToHex(bytes));
}

function toBlock(block?: BlockOptions): RunCallOpts["block"] {
  if (!block) {
    return undefined;
  }
  const { prevrandao = 0n, blobBaseFee = 1n } = block;
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
      getBlobGasPrice: () => blobBaseFee,
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
