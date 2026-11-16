/**
 * Adapter for converting TraceStep to Machine.State.
 *
 * Bridges the trace data from programs-react into the
 * Machine.State interface required by @ethdebug/pointers
 * for pointer dereferencing.
 */

import { type Machine, Raw } from "@ethdebug/common";
import type { TraceStep } from "./mockTrace.js";

/**
 * Convert a TraceStep into a Machine.State suitable for
 * pointer dereferencing.
 *
 * @param step - The trace step with EVM state
 * @returns A Machine.State backed by the step's data
 */
export function traceStepToMachineState(step: TraceStep): Machine.State {
  // Build stack entries (Raw objects, 32-byte padded)
  const stackEntries = (step.stack || []).map((entry) =>
    typeof entry === "string"
      ? Raw.padUntilAtLeast(Raw.fromHex(entry), 32)
      : Raw.padUntilAtLeast(Raw.fromUint(entry), 32),
  );

  // Parse memory from hex string
  const memoryData = step.memory ? Raw.fromHex(step.memory) : Raw.zero();

  // Build storage map (normalized 32-byte keys)
  const storageMap = new Map<string, Raw>();
  for (const [slot, value] of Object.entries(step.storage || {})) {
    const key = Raw.toHex(Raw.padUntilAtLeast(Raw.fromHex(slot), 32));
    storageMap.set(key, Raw.padUntilAtLeast(Raw.fromHex(value), 32));
  }

  const stack: Machine.State.Stack = {
    get length() {
      return Promise.resolve(BigInt(stackEntries.length));
    },
    async peek({ depth, slice }) {
      const index = stackEntries.length - 1 - Number(depth);
      if (index < 0 || index >= stackEntries.length) {
        throw new Error(
          `Stack underflow: depth ${depth} ` +
            `exceeds stack size ${stackEntries.length}`,
        );
      }
      const entry = stackEntries[index];
      if (!slice) {
        return entry;
      }
      const { offset, length } = slice;
      return entry.slice(Number(offset), Number(offset + length));
    },
  };

  const memory = makeBytesReader(memoryData);

  const storage: Machine.State.Words = {
    async read({ slot, slice }) {
      const key = Raw.toHex(Raw.padUntilAtLeast(slot, 32));
      const value = storageMap.get(key) || Raw.padUntilAtLeast(Raw.zero(), 32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      return value.slice(Number(offset), Number(offset + length));
    },
  };

  // Returndata from the step, if available
  const returndataData = step.returndata
    ? Raw.fromHex(step.returndata)
    : Raw.zero();

  return {
    get traceIndex() {
      return Promise.resolve(0n);
    },
    get programCounter() {
      return Promise.resolve(BigInt(step.pc));
    },
    get opcode() {
      return Promise.resolve(step.opcode);
    },
    stack,
    memory,
    storage,
    calldata: makeBytesReader(Raw.zero()),
    returndata: makeBytesReader(returndataData),
    code: makeBytesReader(Raw.zero()),
    transient: makeEmptyWordsReader(),
  };
}

/**
 * Create a Machine.State.Bytes reader from a Raw buffer.
 */
function makeBytesReader(data: Raw): Machine.State.Bytes {
  return {
    get length() {
      return Promise.resolve(BigInt(data.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > data.length) {
        // Zero-pad reads beyond the buffer
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, data.length - start);
        if (available > 0 && start < data.length) {
          result.set(data.slice(start, start + available), 0);
        }
        return result;
      }
      return data.slice(start, end);
    },
  };
}

/**
 * Create an empty Machine.State.Words reader (returns
 * zero for all slots).
 */
function makeEmptyWordsReader(): Machine.State.Words {
  return {
    async read({ slice }) {
      const value = Raw.padUntilAtLeast(Raw.zero(), 32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      return value.slice(Number(offset), Number(offset + length));
    },
  };
}
