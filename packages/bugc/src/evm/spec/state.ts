import type { $ } from "./hkts.js";
import type { Stack, TopN, PopN, Push } from "./stack.js";
import type * as Format from "@ethdebug/format";

export namespace Unsafe {
  /**
   * Type-unsafe representation of EVM execution state containing a stack.
   * The type parameter U represents the concrete state implementation.
   */
  export type State<U> = $<U, [Stack]>;

  /**
   * Type-unsafe representation of a single stack item.
   * The type parameter I represents the concrete stack item implementation.
   */
  export type StackItem<I> = $<I, [Stack.Brand]>;

  /**
   * Low-level, type-unsafe operations on EVM execution state.
   * These operations work directly with the concrete implementations without type safety.
   */
  export interface StateControls<U, I> {
    /** Remove items from the top of the stack, returning the remaining state */
    slice(
      state: Unsafe.State<U>,
      start?: number,
      end?: number,
    ): Unsafe.State<U>;

    /** Add a new item to the top of the stack */
    prepend(state: Unsafe.State<U>, item: Unsafe.StackItem<I>): Unsafe.State<U>;

    /** Read the top N items from the stack without modifying the state */
    readTop(
      state: Unsafe.State<U>,
      num: number,
    ): readonly Unsafe.StackItem<I>[];

    /** Create a new stack item with a unique identifier and type brand */
    create(id: string, brand: Stack.Brand): Unsafe.StackItem<I>;

    /** Create a copy of an existing stack item with a new identifier */
    duplicate(item: Unsafe.StackItem<I>, id: string): Unsafe.StackItem<I>;

    /** Rebrand a stack item while keeping everything else the same */
    rebrand(item: Unsafe.StackItem<I>, brand: Stack.Brand): Unsafe.StackItem<I>;

    /** Generate a unique identifier and update state to track it */
    generateId(
      state: Unsafe.State<U>,
      prefix?: string,
    ): {
      id: string;
      state: Unsafe.State<U>;
    };

    /** Emit an instruction and update the execution state accordingly */
    emit(state: Unsafe.State<U>, instruction: Instruction): Unsafe.State<U>;
  }
}

/**
 * Debug context type for instructions
 */
export type InstructionDebug = {
  context?: Format.Program.Context;
};

/**
 * Represents an EVM instruction with its mnemonic, opcode, optional immediate
 * values, and optional debug context for source mapping.
 */
export interface Instruction {
  mnemonic: string;
  opcode: number;
  immediates?: number[];
  debug?: InstructionDebug;
}

export type InstructionOptions = Pick<Instruction, "debug">;

export namespace State {
  export type Controls<U, I> = ReturnType<typeof State.makeControls<U, I>>;

  /**
   * Creates type-safe wrappers around unsafe state control operations.
   * This provides compile-time guarantees about stack operations while delegating
   * the actual implementation to the unsafe controls.
   */
  export const makeControls = <U, I>({
    slice,
    prepend,
    readTop,
    generateId,
    create,
    duplicate,
    rebrand,
    emit,
  }: Unsafe.StateControls<U, I>) =>
    ({
      /** Pop N items from the stack, updating the stack type accordingly */
      popN<S extends Stack, N extends number>(
        state: $<U, [S]>,
        num: N,
      ): $<U, [PopN<S, N>]> {
        return slice(state, num) as unknown;
      },
      /** Push an item onto the stack, updating the stack type accordingly */
      push<S extends Stack, B extends Stack.Brand>(
        state: $<U, [S]>,
        item: $<I, [B]>,
      ): $<U, [Push<S, [B]>]> {
        return prepend(state, item) as unknown;
      },
      /** Read the top N items from the stack with proper typing */
      topN<S extends Stack, N extends number>(
        state: $<U, [S]>,
        num: N,
      ): Stack.Items<I, TopN<S, N>> {
        return readTop(state, num) as unknown as Stack.Items<I, TopN<S, N>>;
      },
      /** Create a new typed stack item */
      create<B extends Stack.Brand>(id: string, brand: B): $<I, [B]> {
        return create(id, brand);
      },
      /** Duplicate a typed stack item with a new identifier */
      duplicate<B extends Stack.Brand>(item: $<I, [B]>, id: string) {
        return duplicate(item, id);
      },
      /** Duplicate a typed stack item with a new identifier */
      rebrand<B extends Stack.Brand>(item: $<I, [B]>, brand: B) {
        return rebrand(item, brand);
      },
      /** Generate a unique identifier while preserving stack type */
      generateId<S extends Stack>(
        state: $<U, [S]>,
        prefix?: string,
      ): {
        id: string;
        state: $<U, [S]>;
      } {
        return generateId(state, prefix);
      },
      /** Emit an instruction while preserving stack type */
      emit<S extends Stack>(
        state: $<U, [S]>,
        instruction: Instruction,
      ): $<U, [S]> {
        return emit(state, instruction);
      },
    }) as const;
}

export namespace Specifiers {
  /**
   * Configuration options for creating EVM operation functions.
   */
  export interface MakeOperationOptions<C extends Stack, P extends Stack> {
    /** Stack types that this operation will consume (pop from stack) */
    consumes: C;
    /** Stack types that this operation will produce (push to stack) */
    produces: P;
    /** Optional prefix for generated identifiers */
    idPrefix?: string;
  }

  /**
   * Maps a list of instructions to their corresponding operation functions.
   * Creates an object where keys are instruction mnemonics and values are of type F.
   */
  export type MappedInstructions<L extends readonly Instruction[], F> = {
    [M in L[number]["mnemonic"]]: F;
  };

  /**
   * Creates factory functions for building type-safe EVM operations.
   * This is the main entry point for creating operations that consume and produce
   * stack items with compile-time type safety.
   */
  export function makeUsing<U, I>(controls: State.Controls<U, I>) {
    /**
     * Creates operation functions for instructions that don't require immediate values.
     * Returns a curried function: options -> instruction -> state transition function
     */
    const makeOperationForInstruction =
      <C extends Stack, P extends Stack>({
        consumes,
        produces,
        idPrefix,
      }: Specifiers.MakeOperationOptions<C, P>) =>
      <T extends Instruction>(instruction: T) =>
      (options?: InstructionOptions) =>
      <S extends Stack>(
        initialState: $<U, [readonly [...C, ...S]]>,
      ): $<U, [readonly [...P, ...S]]> =>
        executeOperation(
          controls,
          initialState,
          consumes,
          produces,
          { ...instruction, ...options },
          idPrefix,
          undefined,
        );

    /**
     * Creates operation functions for instructions that require immediate values.
     * Returns a curried function: options -> instruction -> state transition function
     * The resulting function requires an immediates parameter.
     */
    const makeOperationWithImmediatesForInstruction =
      <C extends Stack, P extends Stack>({
        consumes,
        produces,
        idPrefix,
      }: Specifiers.MakeOperationOptions<C, P>) =>
      <T extends Instruction>(instruction: T) =>
      (immediates: number[], options?: InstructionOptions) =>
      <S extends Stack>(
        initialState: $<U, [readonly [...C, ...S]]>,
      ): $<U, [readonly [...P, ...S]]> =>
        executeOperation(
          controls,
          initialState,
          consumes,
          produces,
          { ...instruction, immediates, ...options },
          idPrefix,
          undefined,
        );

    /**
     * Helper function to create a mnemonic-keyed mapping for a single instruction.
     * Useful for building instruction operation lookup tables.
     */
    const mapInstruction = <T extends Instruction, F>(
      instruction: T,
      forInstruction: (instruction: T) => F,
    ): Specifiers.MappedInstructions<readonly [T], F> =>
      ({
        [instruction.mnemonic]: forInstruction(instruction),
      }) as Specifiers.MappedInstructions<readonly [T], F>;

    return {
      mapInstruction,
      makeOperationForInstruction,
      makeOperationWithImmediatesForInstruction,
    };
  }
}

/**
 * Core implementation shared by both operation factories.
 * Handles the common pattern of: pop items -> generate IDs -> push results -> emit instruction
 */
function executeOperation<
  U,
  I,
  S extends Stack,
  C extends Stack,
  P extends Stack,
  T extends Instruction,
  P2 extends Stack = P,
>(
  controls: State.Controls<U, I>,
  initialState: $<U, [readonly [...C, ...S]]>,
  consumes: C,
  produces: P,
  instruction: T,
  idPrefix?: string,
  options?: { produces: P2 },
): $<U, [readonly [...P2, ...S]]> {
  let state = controls.popN<S, C["length"]>(initialState, consumes.length);

  let id;
  for (let i = produces.length - 1; i >= 0; i--) {
    ({ id, state } = controls.generateId(state, idPrefix));
    state = controls.push(
      state,
      controls.create(id, (options?.produces || produces)[i]),
    );
  }

  return controls.emit(state, instruction);
}
