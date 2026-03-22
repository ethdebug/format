import * as Format from "@ethdebug/format";

import * as Evm from "#evm";
import { type _ } from "#evm";

import * as Analysis from "#evmgen/analysis";
import type { Error } from "#evmgen/errors";

// Debug context type for EVM instructions
export type DebugContext = {
  context?: Format.Program.Context;
};

// Track stack at type level
export interface State<S extends Evm.Stack> {
  brands: S;
  stack: StackItem[];
  nextId: number; // For generating unique IDs
  instructions: Evm.Instruction[];
  memory: Analysis.Memory.Function.Info;
  blockOffsets: Record<string, number>;
  patches: Patch[];
  warnings: Error[];
  functionRegistry: Record<string, number>; // Function name -> bytecode offset
  callStackPointer: number; // Memory location for call stack (0x60)
}

export type Patch =
  | {
      type?: "block"; // Default type for backward compatibility
      index: number;
      target: string;
    }
  | {
      type: "function";
      index: number;
      target: string; // Function name
    }
  | {
      type: "continuation";
      index: number;
      target: string; // Block name
    };

export interface StackItem {
  id: string;
  irValue?: string; // Optional IR value ID (e.g., "t1", "t2")
}

type UnsafeState = State<_ & Evm.Stack>;
type UnsafeItem = StackItem & { brand: _ & Evm.Stack.Brand };

const unsafe: Evm.Unsafe.StateControls<UnsafeState, UnsafeItem> = {
  slice: (state, ...args) => ({
    ...state,
    stack: state.stack.slice(...args),
    brands: state.brands.slice(...args),
  }),
  prepend: (state, item) => ({
    ...state,
    stack: [{ id: item.id }, ...state.stack],
    brands: [item.brand, ...state.brands],
  }),
  create: (id, brand) => ({
    id,
    brand,
  }),
  duplicate: (item, id) => ({
    ...item,
    id,
  }),
  rebrand: (item, brand) => ({
    ...item,
    brand,
  }),
  readTop: (state, num) => {
    // Return the top N stack items with their IDs and brands
    const items = [];
    for (let i = 0; i < num && i < state.stack.length; i++) {
      items.push({
        ...state.stack[i], // Preserves id and irValue
        brand: state.brands[i],
      });
    }
    return items;
  },
  generateId: (state, prefix = "id") => ({
    id: `${prefix}_${state.nextId}`,
    state: {
      ...state,
      nextId: state.nextId + 1,
    },
  }),
  emit: (state, instruction) => ({
    ...state,
    instructions: [...state.instructions, instruction],
  }),
};

export const controls: Evm.State.Controls<UnsafeState, UnsafeItem> =
  Evm.State.makeControls(unsafe);
