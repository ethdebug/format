/**
 * EVM Execution Traces
 *
 * A trace step is an event: which instruction ran, and where. The state
 * at a step is separate: a recorded `Trace` gives the complete
 * `StepState` at any of its steps.
 */

import type { Machine } from "@ethdebug/pointers";
import type { Executor, ExecutionOptions } from "#executor";
import { createMachineState } from "#machine";

/**
 * One executed instruction: what ran and where. The state before it
 * runs is `Trace.stateAt(index)`.
 */
export interface TraceStep {
  /** Program counter */
  pc: number;
  /** Opcode name (e.g., "PUSH1", "SLOAD") */
  opcode: string;
  /** Opcode byte (e.g., 0x60, 0x54) */
  op: number;
  /** Gas remaining before the instruction */
  gasRemaining: bigint;
  /** Gas cost of the instruction (static + dynamic fee) */
  gasCost: bigint;
  /** Message depth: 0 for the transaction's own message */
  depth: number;
  /** Address whose storage the step's frame uses */
  address: string;
  /** Address whose code the step's frame runs */
  codeAddress: string;
}

/**
 * The complete machine state at a trace step: the state before the
 * step's instruction runs. Every part is required.
 */
export interface StepState {
  /** The stack, bottom first (the top is the last element) */
  stack: readonly bigint[];
  memory: Uint8Array;
  /** Storage of the step's contract, by slot */
  storage(slot: bigint): Promise<bigint>;
  /** Transient storage of the step's contract, by slot */
  transient(slot: bigint): Promise<bigint>;
  /** The frame's calldata */
  calldata: Uint8Array;
  /** Return data of the frame's last completed call or create */
  returndata: Uint8Array;
  /** The code the frame runs */
  code: Uint8Array;
}

/**
 * The state at a step of a trace recorded without memory.
 */
export type StepStateWithoutMemory = Omit<StepState, "memory">;

/**
 * Handler function for trace steps during execution.
 */
export type TraceHandler = (step: TraceStep, index: number) => void;

/**
 * How a trace records memory at each step:
 * - "none": no memory (`stateAt` gives no `memory`);
 * - "full": a new copy at every step;
 * - "changed": a new copy only when memory changed since the frame's
 *   previous step; otherwise the step shares that step's copy.
 */
export type MemoryPolicy = "none" | "full" | "changed";

/**
 * One message (a call or a create) of a transaction.
 */
export interface MessageFrame {
  /** Message depth: 0 for the transaction's own message */
  depth: number;
  /** Address whose storage the frame uses (the new contract's address
   * for a create) */
  address: string;
  /** Address whose code the frame runs */
  codeAddress: string;
  /** The message's sender */
  caller: string;
  /** Input data (empty for a create) */
  calldata: Uint8Array;
  /** Init code, for a create */
  initcode?: Uint8Array;
  /** Value sent with the message */
  value: bigint;
  /** Whether the message is a create */
  create: boolean;
  /** Whether the message is a DELEGATECALL */
  delegatecall: boolean;
  /** Whether the message is static (STATICCALL) */
  static: boolean;
}

/**
 * A message frame starts ("enter") or ends ("exit"). An enter carries
 * the index of the frame's first trace step; an exit, the index of
 * its last (one less than its first, for a frame with no steps, as a
 * precompile's), the message's return data (for a create: the deployed
 * code) and whether the message reverted, so its state changes were
 * undone.
 */
export type FrameEvent =
  | { kind: "enter"; frame: MessageFrame; first: number }
  | {
      kind: "exit";
      frame: MessageFrame;
      last: number;
      returnData: Uint8Array;
      reverted: boolean;
      error?: string;
    };

/**
 * Handler function for message frame events during execution.
 */
export type FrameHandler = (event: FrameEvent) => void;

/**
 * Handlers to call while executing.
 */
export interface TraceOptions {
  /** Called before each instruction */
  step?: TraceHandler;
  /** Called when a message frame starts or ends */
  frame?: FrameHandler;
}

/**
 * A message frame of a recorded trace.
 */
export interface TraceFrame extends MessageFrame {
  /** Index of the enclosing frame in `Trace.frames` */
  parent?: number;
  /** Index of the frame's first step */
  first: number;
  /** Index of the first step after the frame ended */
  end: number;
  returnData: Uint8Array;
  reverted: boolean;
}

/**
 * One transaction's steps and frames, with the state at every step.
 * Pass it to `Executor.call`, `deploy` or `execute`; a trace records
 * one transaction.
 */
export interface Trace<S = StepState> {
  readonly steps: readonly TraceStep[];
  readonly frames: readonly TraceFrame[];
  /** The frame a step runs in */
  frameAt(index: number): TraceFrame;
  /**
   * The state at a step. Storage the transaction did not touch is
   * read from the executor, and only while it has not changed since
   * the transaction: afterwards such a read throws.
   */
  stateAt(index: number): S;
  /** @internal */
  readonly [recorder]: Recorder;
}

/**
 * Options for recording a trace.
 */
export interface RecordOptions extends TraceOptions {
  /** How to record memory (default "full") */
  memory?: MemoryPolicy;
}

/** @internal */
export const recorder = Symbol("recorder");

/**
 * What the executor tells a trace while it runs a transaction.
 * @internal
 */
export interface Recorder {
  readonly started: boolean;
  enter(frame: MessageFrame, code: Uint8Array): void;
  exit(event: FrameEvent & { kind: "exit" }): void;
  /** The value in a storage slot, just before SLOAD or SSTORE */
  observe(address: string, slot: bigint, value: bigint): void;
  step(event: TraceStep, stack: bigint[], memory: Uint8Array): void;
  /** The transaction ended; read untouched storage with `base` */
  end(base: (address: string, slot: bigint) => Promise<bigint>): void;
}

/**
 * Record a trace with the state at every step.
 */
export function createTrace(
  options: RecordOptions & { memory: "none" },
): Trace<StepStateWithoutMemory>;
export function createTrace(options?: RecordOptions): Trace<StepState>;
export function createTrace(
  options: RecordOptions = {},
): Trace<StepState> | Trace<StepStateWithoutMemory> {
  const policy = options.memory ?? "full";

  const steps: TraceStep[] = [];
  const frames: (TraceFrame & { code: Uint8Array })[] = [];
  const stepFrame: number[] = [];
  const stacks: bigint[][] = [];
  const memories: Uint8Array[] = [];
  const returndatas: Uint8Array[] = [];

  // open frames, innermost last, with what each needs while open
  const open: {
    frame: number;
    returndata: Uint8Array;
    storageWrites: number;
    transientWrites: number;
    memory?: Uint8Array;
    opcode?: number;
  }[] = [];

  const storage = createJournal();
  const transient = createJournal();
  const observed = new Map<string, bigint>();
  let base: ((address: string, slot: bigint) => Promise<bigint>) | undefined;
  let started = false;

  const record: Recorder = {
    get started() {
      return started;
    },

    enter(message, code) {
      started = true;
      const parent = open[open.length - 1]?.frame;
      frames.push({
        ...message,
        ...(parent === undefined ? {} : { parent }),
        first: steps.length,
        end: steps.length,
        returnData: new Uint8Array(),
        reverted: false,
        code,
      });
      open.push({
        frame: frames.length - 1,
        returndata: new Uint8Array(),
        storageWrites: storage.writes.length,
        transientWrites: transient.writes.length,
      });
      options.frame?.({ kind: "enter", frame: message, first: steps.length });
    },

    exit(event) {
      const closed = open.pop()!;
      const frame = frames[closed.frame];
      frame.end = steps.length;
      frame.returnData = event.returnData;
      frame.reverted = event.reverted;
      if (event.reverted) {
        storage.undo(closed.storageWrites, steps.length);
        transient.undo(closed.transientWrites, steps.length);
      }
      const parent = open[open.length - 1];
      if (parent) {
        // after a successful create, RETURNDATASIZE is zero
        parent.returndata =
          frame.create && !event.reverted ? new Uint8Array() : event.returnData;
      }
      options.frame?.(event);
    },

    observe(address, slot, value) {
      const key = keyOf(address, slot);
      if (!observed.has(key)) {
        observed.set(key, value);
      }
    },

    step(event, stack, memory) {
      const { op: opcode } = event;
      const index = steps.length;
      const current = open[open.length - 1]!;
      steps.push(event);
      stepFrame.push(current.frame);
      stacks.push([...stack]);
      returndatas.push(current.returndata);

      if (policy === "full") {
        memories.push(new Uint8Array(memory));
      } else if (policy === "changed") {
        const shared = shareMemory(current.memory, current.opcode, memory);
        current.memory = shared;
        current.opcode = opcode;
        memories.push(shared);
      }

      if (opcode === 0x55 /* SSTORE */ || opcode === 0x5d /* TSTORE */) {
        const [value, slot] = stack.slice(-2);
        (opcode === 0x55 ? storage : transient).write(
          keyOf(event.address, slot),
          value,
          index,
        );
      }

      options.step?.(event, index);
    },

    end(read) {
      base = read;
    },
  };

  const frameAt = (index: number) => {
    check(index);
    return frames[stepFrame[index]];
  };

  const check = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= steps.length) {
      throw new RangeError(`no trace step ${index}`);
    }
  };

  const stateAt = (index: number): StepState | StepStateWithoutMemory => {
    const frame = frameAt(index);
    const state: StepStateWithoutMemory = {
      stack: stacks[index],
      async storage(slot) {
        const key = keyOf(frame.address, slot);
        const written = storage.valueAt(key, index);
        if (written !== undefined) return written;
        const value = observed.get(key);
        if (value !== undefined) return value;
        if (!base) {
          throw new Error("the trace's transaction has not ended");
        }
        return base(frame.address, slot);
      },
      async transient(slot) {
        return transient.valueAt(keyOf(frame.address, slot), index) ?? 0n;
      },
      calldata: frame.calldata,
      returndata: returndatas[index],
      code: frame.code,
    };
    return policy === "none" ? state : { ...state, memory: memories[index] };
  };

  return {
    steps,
    frames,
    frameAt,
    stateAt,
    [recorder]: record,
  } as Trace<StepState> | Trace<StepStateWithoutMemory>;
}

interface Write {
  value: bigint;
  /** The writing step; the value holds from the next step */
  step: number;
  /** The first step at which the write is undone */
  undone: number;
}

/**
 * Writes to storage or transient storage, by address and slot.
 */
function createJournal() {
  const writes: Write[] = [];
  const byKey = new Map<string, Write[]>();
  return {
    writes,
    write(key: string, value: bigint, step: number) {
      const write = { value, step, undone: Infinity };
      writes.push(write);
      const list = byKey.get(key);
      if (list) list.push(write);
      else byKey.set(key, [write]);
    },
    /** Undo the writes from `start` on, from step `at` */
    undo(start: number, at: number) {
      for (let i = start; i < writes.length; i++) {
        writes[i].undone = Math.min(writes[i].undone, at);
      }
    },
    /** The value in effect at a step, if a write set it */
    valueAt(key: string, index: number): bigint | undefined {
      const list = byKey.get(key) ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const { value, step, undone } = list[i];
        if (step < index && undone > index) return value;
      }
      return undefined;
    },
  };
}

function keyOf(address: string, slot: bigint): string {
  return `${address}:${slot.toString(16)}`;
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

/**
 * Create a Machine that traces execution and yields
 * Machine.State for each step.
 *
 * @param executor - EVM executor to trace
 * @param options - Execution options for the call
 */
export function createMachine(
  executor: Executor,
  options: ExecutionOptions = {},
): Machine {
  return {
    trace(): AsyncIterable<Machine.State> {
      return traceExecution(executor, options);
    },
  };
}

async function* traceExecution(
  executor: Executor,
  options: ExecutionOptions,
): AsyncGenerator<Machine.State> {
  const trace = createTrace();
  await executor.execute(options, trace);

  for (let i = 0; i < trace.steps.length; i++) {
    const { pc, opcode } = trace.steps[i];
    yield createMachineState(trace.stateAt(i), {
      pc,
      opcode,
      traceIndex: i,
    });
  }
}
