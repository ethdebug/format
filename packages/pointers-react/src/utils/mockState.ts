/**
 * Utilities for creating mock Machine.State objects for visualization.
 */

import { type Machine, Raw } from "@ethdebug/common";

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
      ? Raw.padUntilAtLeast(Raw.fromHex(entry), 32)
      : Raw.padUntilAtLeast(Raw.fromUint(entry), 32),
  );

  const memoryData = spec.memory ? Raw.fromHex(spec.memory) : Raw.zero();

  const storageMap = new Map<string, Raw>();
  for (const [slot, value] of Object.entries(spec.storage || {})) {
    const normalizedSlot = Raw.toHex(
      Raw.padUntilAtLeast(Raw.fromHex(slot), 32),
    );
    storageMap.set(normalizedSlot, Raw.padUntilAtLeast(Raw.fromHex(value), 32));
  }

  const calldataData = spec.calldata ? Raw.fromHex(spec.calldata) : Raw.zero();
  const returndataData = spec.returndata
    ? Raw.fromHex(spec.returndata)
    : Raw.zero();
  const codeData = spec.code ? Raw.fromHex(spec.code) : Raw.zero();

  const transientMap = new Map<string, Raw>();
  for (const [slot, value] of Object.entries(spec.transient || {})) {
    const normalizedSlot = Raw.toHex(
      Raw.padUntilAtLeast(Raw.fromHex(slot), 32),
    );
    transientMap.set(
      normalizedSlot,
      Raw.padUntilAtLeast(Raw.fromHex(value), 32),
    );
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
      return entry.slice(Number(offset), Number(offset + length));
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
        return result;
      }
      return memoryData.slice(start, end);
    },
  };

  const storage: Machine.State.Words = {
    async read({ slot, slice }) {
      const normalizedSlot = Raw.toHex(Raw.padUntilAtLeast(slot, 32));
      const value =
        storageMap.get(normalizedSlot) || Raw.padUntilAtLeast(Raw.zero(), 32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      return value.slice(Number(offset), Number(offset + length));
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
        return result;
      }
      return calldataData.slice(start, end);
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
        return result;
      }
      return returndataData.slice(start, end);
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
        return result;
      }
      return codeData.slice(start, end);
    },
  };

  const transient: Machine.State.Words = {
    async read({ slot, slice }) {
      const normalizedSlot = Raw.toHex(Raw.padUntilAtLeast(slot, 32));
      const value =
        transientMap.get(normalizedSlot) || Raw.padUntilAtLeast(Raw.zero(), 32);
      if (!slice) {
        return value;
      }
      const { offset, length } = slice;
      return value.slice(Number(offset), Number(offset + length));
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
 * Format a Raw value as a shortened hex string for display.
 */
export function formatDataShort(data: Raw, maxLength = 10): string {
  const hex = Raw.toHex(data);
  if (hex.length <= maxLength + 2) {
    return hex;
  }
  const prefixLength = Math.floor((maxLength - 2) / 2);
  const suffixLength = maxLength - 2 - prefixLength;
  return `${hex.slice(0, 2 + prefixLength)}...${hex.slice(-suffixLength)}`;
}

/**
 * Format a Raw value as a full hex string.
 */
export function formatData(data: Raw): string {
  return Raw.toHex(data);
}
