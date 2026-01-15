import type * as Ast from "#ast";
import type * as Ir from "#ir";
import type { Types } from "#types";
import { Severity } from "#result";

import { Error as IrgenError } from "#irgen/errors";

/**
 * Main state for IR generation - immutable and passed through all operations
 */
export interface State {
  readonly types: Types; // Type information (read-only)

  readonly module: State.Module; // Module being built incrementally
  readonly function: State.Function; // Current function context
  readonly block: State.Block; // Current block context
  readonly scopes: State.Scopes; // Variable scoping for name resolution
  readonly loops: State.Loops; // Loop contexts for break/continue
  readonly counters: State.Counters; // ID generation counters

  readonly errors: State.Errors; // Accumulated errors
  readonly warnings: State.Warnings; // Accumulated warnings
}

export namespace State {
  export namespace Types {
    const extract = makeExtract<Types>((read) => (state) => read(state.types));

    export const nodeType = (node: Ast.Node) =>
      extract((types) => types.get(node.id));
  }

  /**
   * Partially built module
   */
  export interface Module {
    readonly name: string;
    readonly functions: Map<string, Ir.Function>;
    readonly main?: Ir.Function;
    readonly create?: Ir.Function;
    readonly storageDeclarations: Ast.Declaration.Storage[];
  }

  export namespace Module {
    const update = makeUpdate<State.Module>((modify) => (state) => ({
      ...state,
      module: modify(state.module),
    }));

    export const main = Symbol("main");
    export const create = Symbol("create");

    export const addFunction = (
      name: string | typeof main | typeof create,
      function_: Ir.Function,
    ) =>
      update((module) => ({
        ...module,
        ...(name !== main && name !== create
          ? {
              functions: new Map([
                ...module.functions,
                [name.toString(), function_],
              ]),
            }
          : {}),
        ...(name === main ? { main: function_ } : {}),
        ...(name === create ? { create: function_ } : {}),
      }));
  }

  /**
   * Current function being built
   */
  export interface Function {
    readonly id: string;
    readonly parameters: Ir.Function.Parameter[]; // Function parameters
    readonly blocks: Map<string, Ir.Block>; // All blocks in function
    readonly ssaMetadata?: Map<string, Ir.Function.SsaVariable>; // SSA variable metadata for phi insertion
  }

  export namespace Function {
    const update = makeUpdate<State.Function>((modify) => (state) => ({
      ...state,
      function: modify(state.function),
    }));

    export const addParameter = (param: Ir.Function.Parameter) =>
      update((function_) => ({
        ...function_,
        parameters: [...function_.parameters, param],
      }));

    export const addBlock = (id: string, block: Ir.Block) =>
      update((function_) => ({
        ...function_,
        blocks: new Map([...function_.blocks, [id, block]]),
      }));
  }

  /**
   * Current block being built - incomplete until terminator is set
   */
  export interface Block {
    readonly id: string;
    readonly instructions: Ir.Instruction[];
    readonly terminator?: Ir.Block.Terminator; // Optional during building
    readonly predecessors: Set<string>;
    readonly phis: Ir.Block.Phi[]; // Phi nodes for the block
    /** Track which temp each predecessor uses for each variable */
    readonly predecessorTemps?: Map<string, Map<string, string>>; // varName -> (predBlock -> tempId)
  }

  export namespace Block {
    const update = makeUpdate<State.Block>((modify) => (state) => ({
      ...state,
      block: modify(state.block),
    }));

    const extract = makeExtract<State.Block>(
      (read) =>
        ({ block }) =>
          read(block),
    );

    export const emit = (instruction: Ir.Instruction) =>
      update((block) => ({
        ...block,
        instructions: [...block.instructions, instruction],
      }));

    export const terminator = () => extract((block) => block.terminator);

    export const setTerminator = (terminator: Ir.Block.Terminator) =>
      State.Errors.attempt(
        update((block) => {
          if (block.terminator) {
            throw new IrgenError(
              `Block ${block.id} already has terminator`,
              undefined,
              Severity.Warning,
            );
          }

          return {
            ...block,
            terminator,
          };
        }),
      );

    export const addPhi = (phi: Ir.Block.Phi) =>
      update((block) => ({
        ...block,
        phis: [...block.phis, phi],
      }));
  }

  /**
   * Variable scoping stack
   */
  export interface Scopes {
    readonly stack: State.Scope[];
  }

  export interface Scope {
    readonly ssaVars: Map<string, SsaVariable>; // SSA variable tracking
    readonly usedNames: Map<string, number>; // For handling shadowing
  }

  /**
   * SSA variable information
   */
  export interface SsaVariable {
    readonly name: string; // Original variable name
    readonly currentTempId: string; // Current SSA temp
    readonly type: Ir.Type;
    readonly version: number; // SSA version number
  }

  export namespace Scopes {
    export const update = makeUpdate<State.Scopes>((modify) => (state) => ({
      ...state,
      scopes: modify(state.scopes),
    }));

    export const extract = makeExtract<State.Scopes>(
      (read) => (state) => read(state.scopes),
    );

    export const push = () =>
      update((scopes) => ({
        stack: [...scopes.stack, { ssaVars: new Map(), usedNames: new Map() }],
      }));

    export const pop = () =>
      State.Errors.attempt(
        update((scopes) => {
          if (scopes.stack.length <= 1) {
            throw new IrgenError(
              "Cannot pop last scope",
              undefined,
              Severity.Error,
            );
          }

          return {
            stack: scopes.stack.slice(0, -1),
          };
        }),
      );

    export const current = () => extract((scopes) => scopes.stack.at(-1)!);

    export const setCurrent = (scope: State.Scope) =>
      update((scopes) => ({
        stack: [...scopes.stack.slice(0, -1), scope],
      }));

    export const lookupVariable = (name: string) =>
      extract((scopes) => {
        // Search from innermost to outermost scope
        for (let i = scopes.stack.length - 1; i >= 0; i--) {
          const ssaVar = scopes.stack[i].ssaVars.get(name);
          if (ssaVar) {
            return ssaVar;
          }
        }
        return null;
      });
  }

  export interface Loop {
    readonly continueTarget: string; // Block ID for continue
    readonly breakTarget: string; // Block ID for break
  }

  export interface Loops {
    readonly stack: State.Loop[];
  }

  export namespace Loops {
    const update = makeUpdate<State.Loops>((modify) => (state) => ({
      ...state,
      loops: modify(state.loops),
    }));

    export const push = (continueTarget: string, breakTarget: string) =>
      update((loops) => ({
        stack: [...loops.stack, { continueTarget, breakTarget }],
      }));

    export const pop = () =>
      State.Errors.attempt(
        update((loops) => {
          if (loops.stack.length < 1) {
            throw new IrgenError(
              "Cannot exit loop if not currently inside a loop",
              undefined,
              Severity.Error,
            );
          }

          return {
            stack: loops.stack.slice(0, -1),
          };
        }),
      );
  }

  /**
   * Counters for ID generation
   */
  export interface Counters {
    readonly temp: number; // For temporary IDs (t0, t1, ...)
    readonly block: number; // For block IDs (block_1, block_2, ...)
  }

  export namespace Counters {
    const update = makeUpdate<State.Counters>((modify) => (state) => ({
      ...state,
      counters: modify(state.counters),
    }));

    const extract = makeExtract<State.Counters>(
      (read) => (state) => read(state.counters),
    );

    export const nextTemp = () => extract(({ temp }) => temp);
    export const consumeTemp = () =>
      update((counters) => ({ ...counters, temp: counters.temp + 1 }));

    export const nextBlock = () => extract(({ block }) => block);
    export const consumeBlock = () =>
      update((counters) => ({ ...counters, block: counters.block + 1 }));
  }

  export type Errors = IrgenError[];

  export namespace Errors {
    const update = makeUpdate<State.Errors>((modify) => (state) => ({
      ...state,
      errors: modify(state.errors),
    }));

    const extract = makeExtract<State.Errors>(
      (read) => (state) => read(state.errors),
    );

    export const count = () => extract((errors) => errors.length);

    export const append = (error: IrgenError) =>
      update((errors) => [...errors, error]);

    export const attempt = makeUpdate<State>((modify) => (state) => {
      try {
        return modify(state);
      } catch (error) {
        if (error instanceof IrgenError) {
          return State.Errors.append(error)(state);
        }
        throw error;
      }
    });
  }

  export type Warnings = IrgenError[];

  export namespace Warnings {
    const update = makeUpdate<State.Warnings>((modify) => (state) => ({
      ...state,
      warnings: modify(state.warnings),
    }));

    export const append = (warning: IrgenError) =>
      update((warnings) => [...warnings, warning]);
  }
}

// Brand symbols for runtime type detection
const MODIFY_BRAND = Symbol("modify");
const READ_BRAND = Symbol("read");

export type Modify<S> = ((substate: S) => S) & { [MODIFY_BRAND]: true };
export type Read<S, T> = ((substate: S) => T) & { [READ_BRAND]: true };

export type Update<S> = (modify: (substate: S) => S) => Modify<State>;
export type Extract<S> = <T>(read: (substate: S) => T) => Read<State, T>;

export function makeUpdate<S>(
  update: (modify: (substate: S) => S) => (state: State) => State,
): Update<S> {
  return (modify) => {
    const function_ = update(modify);
    return Object.assign(function_, { [MODIFY_BRAND]: true as const });
  };
}

export function makeExtract<S>(
  extract: <T>(read: (substate: S) => T) => (state: State) => T,
): Extract<S> {
  return (read) => {
    const function_ = extract(read);
    return Object.assign(function_, { [READ_BRAND]: true as const });
  };
}

// Type guards that check for brands
export function isModify<S>(fn: unknown): fn is Modify<S> {
  return typeof fn === "function" && MODIFY_BRAND in fn;
}

export function isRead<S, T>(fn: unknown): fn is Read<S, T> {
  return typeof fn === "function" && READ_BRAND in fn;
}
