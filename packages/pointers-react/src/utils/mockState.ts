/**
 * Utilities for creating mock Machine.State objects for visualization.
 */

import { type Machine, Data } from "@ethdebug/pointers";

/**
 * Specification for creating a mock Machine.State.
 */
export interface MockStateSpec {
  /** Stack entries (from top to bottom). Can be hex strings or bigints. */
  stack?: Array<string | bigint>;
  /** Memory contents as hex string (e.g., "0x1234...") */
  memory?: string;
  /** Storage slots: slot (hex) → value (hex) */
  storage?: Record<string, string>;
  /** Calldata as hex string */
  calldata?: string;
  /** Return data as hex string */
  returndata?: string;
  /** Contract code as hex string */
  code?: string;
  /** Transient storage: slot (hex) → value (hex) */
  transient?: Record<string, string>;
  /** Program counter */
  programCounter?: bigint;
  /** Current opcode name */
  opcode?: string;
  /** Trace index */
  traceIndex?: bigint;
}

/**
 * Create a mock Machine.State from a specification.
 *
 * This creates a fully functional Machine.State that can be used
 * for pointer dereferencing in visualization contexts.
 */
export function createMockState(spec: MockStateSpec): Machine.State {
  const stackEntries = (spec.stack || []).map((entry) =>
    typeof entry === "string"
      ? Data.fromHex(entry).padUntilAtLeast(32)
      : Data.fromUint(entry).padUntilAtLeast(32),
  );

  const memoryData = spec.memory ? Data.fromHex(spec.memory) : Data.zero();

  const storageMap = new Map<string, Data>();
  for (const [slot, value] of Object.entries(spec.storage || {})) {
    const normalizedSlot = Data.fromHex(slot).padUntilAtLeast(32).toHex();
    storageMap.set(normalizedSlot, Data.fromHex(value).padUntilAtLeast(32));
  }

  const calldataData = spec.calldata
    ? Data.fromHex(spec.calldata)
    : Data.zero();
  const returndataData = spec.returndata
    ? Data.fromHex(spec.returndata)
    : Data.zero();
  const codeData = spec.code ? Data.fromHex(spec.code) : Data.zero();

  const transientMap = new Map<string, Data>();
  for (const [slot, value] of Object.entries(spec.transient || {})) {
    const normalizedSlot = Data.fromHex(slot).padUntilAtLeast(32).toHex();
    transientMap.set(normalizedSlot, Data.fromHex(value).padUntilAtLeast(32));
  }

  const stack: Machine.State.Stack = {
    get length() {
      return Promise.resolve(BigInt(stackEntries.length));
    },
    async peek({ depth, slice }) {
      const index = Number(depth);
      if (index >= stackEntries.length) {
        throw new Error(`Stack underflow: depth ${depth} exceeds stack size`);
      }
      const entry = stackEntries[index];
      if (!slice) {
        return entry;
      }
      const { offset, length } = slice;
      const startByte = 32 - Number(offset) - Number(length);
      const endByte = startByte + Number(length);
      return Data.fromBytes(entry.slice(startByte, endByte));
    },
  };

  const memory: Machine.State.Bytes = {
    get length() {
      return Promise.resolve(BigInt(memoryData.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > memoryData.length) {
        // Return zero-padded data for reads beyond memory
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, memoryData.length - start);
        if (available > 0 && start < memoryData.length) {
          result.set(memoryData.slice(start, start + available), 0);
        }
        return Data.fromBytes(result);
      }
      return Data.fromBytes(memoryData.slice(start, end));
    },
  };

  const storage: Machine.State.Words = {
    async read({ slot, slice }) {
      const normalizedSlot = slot.padUntilAtLeast(32).toHex();
      const value =
        storageMap.get(normalizedSlot) || Data.zero().padUntilAtLeast(32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      const startByte = 32 - Number(offset) - Number(length);
      const endByte = startByte + Number(length);
      return Data.fromBytes(value.slice(startByte, endByte));
    },
  };

  const calldata: Machine.State.Bytes = {
    get length() {
      return Promise.resolve(BigInt(calldataData.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > calldataData.length) {
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, calldataData.length - start);
        if (available > 0 && start < calldataData.length) {
          result.set(calldataData.slice(start, start + available), 0);
        }
        return Data.fromBytes(result);
      }
      return Data.fromBytes(calldataData.slice(start, end));
    },
  };

  const returndata: Machine.State.Bytes = {
    get length() {
      return Promise.resolve(BigInt(returndataData.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > returndataData.length) {
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, returndataData.length - start);
        if (available > 0 && start < returndataData.length) {
          result.set(returndataData.slice(start, start + available), 0);
        }
        return Data.fromBytes(result);
      }
      return Data.fromBytes(returndataData.slice(start, end));
    },
  };

  const code: Machine.State.Bytes = {
    get length() {
      return Promise.resolve(BigInt(codeData.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > codeData.length) {
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, codeData.length - start);
        if (available > 0 && start < codeData.length) {
          result.set(codeData.slice(start, start + available), 0);
        }
        return Data.fromBytes(result);
      }
      return Data.fromBytes(codeData.slice(start, end));
    },
  };

  const transient: Machine.State.Words = {
    async read({ slot, slice }) {
      const normalizedSlot = slot.padUntilAtLeast(32).toHex();
      const value =
        transientMap.get(normalizedSlot) || Data.zero().padUntilAtLeast(32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      const startByte = 32 - Number(offset) - Number(length);
      const endByte = startByte + Number(length);
      return Data.fromBytes(value.slice(startByte, endByte));
    },
  };

  return {
    get traceIndex() {
      return Promise.resolve(spec.traceIndex ?? 0n);
    },
    get programCounter() {
      return Promise.resolve(spec.programCounter ?? 0n);
    },
    get opcode() {
      return Promise.resolve(spec.opcode ?? "STOP");
    },
    stack,
    memory,
    storage,
    calldata,
    returndata,
    code,
    transient,
  };
}

/**
 * Format a Data value as a shortened hex string for display.
 */
export function formatDataShort(data: Data, maxLength = 10): string {
  const hex = data.toHex();
  if (hex.length <= maxLength + 2) {
    return hex;
  }
  const prefixLength = Math.floor((maxLength - 2) / 2);
  const suffixLength = maxLength - 2 - prefixLength;
  return `${hex.slice(0, 2 + prefixLength)}...${hex.slice(-suffixLength)}`;
}

/**
 * Format a Data value as a full hex string.
 */
export function formatData(data: Data): string {
  return data.toHex();
}
