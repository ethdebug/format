import * as Format from "@ethdebug/format";

import type * as Ast from "#ast";
import * as Ir from "#ir";

import { assertExhausted } from "#irgen/errors";

import { State, type Modify, type Read, isModify, isRead } from "./state.js";
import {
  collectVariablesWithLocations,
  toVariableContextEntry,
} from "../debug/variables.js";

/**
 * Generator type for IR operations
 * - Yields IrOperation commands
 * - Returns final value of type T
 * - Receives State back after peek operations
 */
export type Process<T> = Generator<Process.Action, T, State>;

export namespace Process {
  /**
   * Operation types that can be yielded from generators
   */
  export type Action =
    | { type: "modify"; fn: (state: State) => State }
    | { type: "peek" }
    | { type: "value"; value: unknown };

  export namespace Types {
    export const nodeType = lift(State.Types.nodeType);
  }

  export namespace Instructions {
    /**
     * Emit an instruction to the current block
     */
    export const emit = lift(State.Block.emit);
  }

  /**
   * Block operations for managing basic blocks in the IR
   */
  export namespace Blocks {
    /**
     * Set the terminator for the current block and update predecessors
     */
    export function* terminate(terminator: Ir.Block.Terminator): Process<void> {
      yield* lift(State.Block.setTerminator)(terminator);

      // Track predecessors for target blocks
      const state: State = yield { type: "peek" };
      const currentBlockId = state.block.id;

      // Record the variables' values on leaving this block, so that
      // each successor can start from them (see Variables.enterBlock)
      const exit = state.scopes.stack.map((scope) => scope.ssaVars);
      yield {
        type: "modify",
        fn: (s: State) => ({
          ...s,
          function: {
            ...s.function,
            exits: new Map([
              ...(s.function.exits ?? []),
              [currentBlockId, exit],
            ]),
          },
        }),
      };

      switch (terminator.kind) {
        case "jump":
          yield* addPredecessorToBlock(terminator.target, currentBlockId);
          break;
        case "branch":
          yield* addPredecessorToBlock(terminator.trueTarget, currentBlockId);
          yield* addPredecessorToBlock(terminator.falseTarget, currentBlockId);
          break;
        case "call":
          yield* addPredecessorToBlock(terminator.continuation, currentBlockId);
          break;
      }
    }

    /**
     * Add a predecessor to a block (creating it if needed)
     */
    const addPredecessorToBlock = function* (
      targetBlockId: string,
      predId: string,
    ): Process<void> {
      const state: State = yield { type: "peek" };
      const existingBlock = state.function.blocks.get(targetBlockId);

      if (existingBlock) {
        // Update existing block with new predecessor
        const updatedBlock: Ir.Block = {
          ...existingBlock,
          predecessors: new Set([...existingBlock.predecessors, predId]),
        };

        // Update function with the updated block
        yield {
          type: "modify",
          fn: (s: State) => ({
            ...s,
            function: {
              ...s.function,
              blocks: new Map([
                ...s.function.blocks,
                [targetBlockId, updatedBlock],
              ]),
            },
          }),
        };
      } else {
        // Create placeholder block with predecessor
        const placeholderBlock: Ir.Block = {
          id: targetBlockId,
          instructions: [],
          // No debug context - compiler-generated placeholder terminator
          terminator: {
            kind: "jump",
            target: targetBlockId,
            operationDebug: {},
          },
          predecessors: new Set([predId]),
          phis: [],
          // No debug context - compiler-generated placeholder block
          debug: {},
        };

        // Add the new block to the function
        yield {
          type: "modify",
          fn: (s: State) => ({
            ...s,
            function: {
              ...s.function,
              blocks: new Map([
                ...s.function.blocks,
                [targetBlockId, placeholderBlock],
              ]),
            },
          }),
        };
      }
    };

    export const currentTerminator = lift(State.Block.terminator);

    /**
     * Create a new block with a generated ID
     */
    export function* create(prefix: string): Process<string> {
      const state: State = yield { type: "peek" };
      const id = `${prefix}_${state.counters.block}`;
      yield* lift(State.Counters.consumeBlock)();
      return id;
    }

    /**
     * Switch to a different block, syncing the current block to the function
     */
    export function* switchTo(blockId: string): Process<void> {
      // First sync current block to function
      yield* syncCurrent();

      // Check if block already exists
      const state: State = yield { type: "peek" };
      const existingBlock = state.function.blocks.get(blockId);

      if (existingBlock) {
        // Switch to existing block, preserving its contents
        // Check if it has a placeholder terminator (self-jump)
        const isPlaceholder =
          existingBlock.terminator &&
          existingBlock.terminator.kind === "jump" &&
          existingBlock.terminator.target === blockId;

        yield {
          type: "modify",
          fn: (state: State) => ({
            ...state,
            block: {
              id: existingBlock.id,
              instructions: [...existingBlock.instructions],
              terminator: isPlaceholder ? undefined : existingBlock.terminator,
              predecessors: new Set(existingBlock.predecessors),
              phis: [...existingBlock.phis],
            },
          }),
        };
      } else {
        // Create new empty block
        const newBlock: State.Block = {
          id: blockId,
          instructions: [],
          terminator: undefined,
          predecessors: new Set(),
          phis: [],
        };

        yield {
          type: "modify",
          fn: (state: State) => ({
            ...state,
            block: newBlock,
          }),
        };
      }

      yield* Variables.enterBlock();
    }

    /**
     * Sync current block to the function
     */
    export function* syncCurrent(): Process<void> {
      const state: State = yield { type: "peek" };
      const block = state.block;

      // Only sync if block has a terminator
      if (block.terminator) {
        const completeBlock: Ir.Block = {
          id: block.id,
          instructions: block.instructions,
          terminator: block.terminator,
          predecessors: block.predecessors,
          phis: block.phis,
          // No debug context - block-level context not currently tracked
          debug: {},
        };

        yield* lift(State.Function.addBlock)(block.id, completeBlock);
      }
    }
  }

  /**
   * Variable and scope management
   */
  export namespace Variables {
    /** A scope's declarations, with `name` declared at `loc` */
    const declaredHere = (
      scope: State.Scope,
      name: string,
      loc: Ast.SourceLocation | undefined,
    ): State.Scope["declared"] =>
      loc
        ? new Map([
            ...(scope.declared ?? []),
            [
              name,
              {
                offset: Number(loc.offset),
                range: scope.declaringIn ?? scope.range,
              },
            ],
          ])
        : scope.declared;

    /**
     * Make the current scope's next declarations in scope over `range`
     * (a `for` loop's, for its init), or over the scope's own range
     * again (undefined).
     */
    export function* declaringIn(
      range: Ast.SourceLocation | undefined,
    ): Process<void> {
      const scope = yield* lift(State.Scopes.current)();
      yield* lift(State.Scopes.setCurrent)({ ...scope, declaringIn: range });
    }

    /**
     * Declare a new SSA variable in the current scope
     */
    export function* declare(
      name: string,
      type: Ir.Type,
      loc?: Ast.SourceLocation,
    ): Process<State.SsaVariable> {
      const scope = yield* lift(State.Scopes.current)();
      const tempId = yield* newTemp();

      const version = (scope.ssaVars.get(name)?.version ?? -1) + 1;
      const ssaVar: State.SsaVariable = {
        name,
        currentTempId: tempId,
        type,
        version,
      };

      // Update scope with new SSA variable
      const newScope = {
        ...scope,
        ssaVars: new Map([...scope.ssaVars, [name, ssaVar]]),
        usedNames: new Map([...scope.usedNames, [name, version + 1]]),
        declared: declaredHere(scope, name, loc),
      };

      // Update scopes
      yield* lift(State.Scopes.setCurrent)(newScope);

      // Track SSA metadata for phi insertion
      const scopeIndex = yield* lift(State.Scopes.extract)(
        (s) => s.stack.length - 1,
      );
      const scopeId = `scope_${scopeIndex}_${name}`;
      yield* addSsaMetadata(tempId, name, scopeId, type, version, { loc });

      return ssaVar;
    }

    /**
     * Declare a new SSA variable with an existing temp ID
     */
    export function* declareWithExistingTemp(
      name: string,
      type: Ir.Type,
      tempId: string,
      loc?: Ast.SourceLocation,
      options: { placeholder?: boolean } = {},
    ): Process<State.SsaVariable> {
      const scope = yield* lift(State.Scopes.current)();

      const version = (scope.ssaVars.get(name)?.version ?? -1) + 1;
      const ssaVar: State.SsaVariable = {
        name,
        currentTempId: tempId,
        type,
        version,
      };

      // Update scope with new SSA variable
      const newScope = {
        ...scope,
        ssaVars: new Map([...scope.ssaVars, [name, ssaVar]]),
        usedNames: new Map([...scope.usedNames, [name, version + 1]]),
        declared: declaredHere(scope, name, loc),
      };

      // Update scopes
      yield* lift(State.Scopes.setCurrent)(newScope);

      // Track SSA metadata for the existing temp
      const scopeIndex = yield* lift(State.Scopes.extract)(
        (s) => s.stack.length - 1,
      );
      const scopeId = `scope_${scopeIndex}_${name}`;
      yield* addSsaMetadata(tempId, name, scopeId, type, version, {
        loc,
        alias: true,
        placeholder: options.placeholder,
      });

      return ssaVar;
    }

    /**
     * Create a new SSA version for a variable (for assignments)
     */
    export function* assignSsa(
      name: string,
      type: Ir.Type,
    ): Process<State.SsaVariable> {
      const tempId = yield* newTemp();

      // Find the current scope that has this variable
      const scopes = yield* lift(State.Scopes.extract)((s) => s.stack);
      let scopeIndex = -1;

      for (let i = scopes.length - 1; i >= 0; i--) {
        if (scopes[i].ssaVars.has(name)) {
          scopeIndex = i;
          break;
        }
      }

      if (scopeIndex === -1) {
        // Variable doesn't exist, create it in current scope
        return yield* declare(name, type);
      }

      const targetScope = scopes[scopeIndex];
      const currentVar = targetScope.ssaVars.get(name)!;
      const newVersion = currentVar.version + 1;

      const ssaVar: State.SsaVariable = {
        name,
        currentTempId: tempId,
        type,
        version: newVersion,
      };

      // Update the target scope
      const updatedScope = {
        ...targetScope,
        ssaVars: new Map([...targetScope.ssaVars, [name, ssaVar]]),
      };

      // Rebuild the scope stack
      const newStack = [
        ...scopes.slice(0, scopeIndex),
        updatedScope,
        ...scopes.slice(scopeIndex + 1),
      ];

      yield* lift(State.Scopes.update)(() => ({ stack: newStack }));

      // Track SSA metadata for phi insertion
      const scopeId = `scope_${scopeIndex}_${name}`;
      yield* addSsaMetadata(tempId, name, scopeId, type, newVersion);

      return ssaVar;
    }

    /**
     * Add SSA metadata for a temp ID
     */
    const addSsaMetadata = function* (
      tempId: string,
      name: string,
      scopeId: string,
      type: Ir.Type,
      version: number,
      options: {
        loc?: Ast.SourceLocation;
        /** The temp holds a value computed earlier (perhaps another
         * variable's): the version is defined here, not at the temp */
        alias?: boolean;
        /** The version only marks the declaration; it holds no value */
        placeholder?: boolean;
      } = {},
    ): Process<void> {
      const { loc, alias, placeholder } = options;
      const state: State = yield { type: "peek" };
      const currentMetadata = state.function.ssaMetadata || new Map();

      // The variable's declaring scope: the innermost scope that holds
      // the name (every version of a declaration, phis included, names
      // the scope that declared it). Its lexical scope ends where that
      // scope's source range ends; a function-level name (a parameter)
      // has no range.
      const stack = state.scopes.stack;
      let declaring = stack.length - 1;
      while (declaring >= 0 && !stack[declaring].ssaVars.has(name)) {
        declaring--;
      }
      const declaration = stack[declaring]?.declared?.get(name);
      const scopeRange = declaration
        ? declaration.range
        : stack[declaring]?.range;
      const scopeEnd = scopeRange
        ? Number(scopeRange.offset) + Number(scopeRange.length)
        : undefined;
      // Two declarations of a name in one scope differ by where each
      // is declared
      const declaredIn = scopeRange
        ? `${Number(scopeRange.offset)}:${scopeEnd}:${declaration?.offset ?? ""}`
        : undefined;

      // A version that aliases a temp is defined just after the
      // instructions emitted so far in the current block: from the
      // next instruction on, never on an instruction of an earlier
      // statement (contexts are postconditions). Each version has its
      // own entry, so an aliased temp's key gets a suffix.
      const defined = alias
        ? {
            block: state.block.id,
            index: state.block.instructions.length - 0.5,
          }
        : undefined;
      let key = tempId;
      for (let n = 1; currentMetadata.has(key); n++) key = `${tempId}~${n}`;

      const newMetadata = new Map(currentMetadata);
      newMetadata.set(key, {
        name,
        scopeId,
        type,
        version,
        loc,
        scopeEnd,
        ...(declaredIn ? { declaredIn } : {}),
        ...(key !== tempId ? { temp: tempId } : {}),
        ...(defined ? { defined } : {}),
        ...(placeholder ? { placeholder } : {}),
      });

      // Update function with new metadata
      yield {
        type: "modify",
        fn: (s: State) => ({
          ...s,
          function: {
            ...s.function,
            ssaMetadata: newMetadata,
          },
        }),
      };
    };

    /**
     * Look up a variable by name in the scope chain
     */
    export const lookup = lift(State.Scopes.lookupVariable);

    /**
     * On entering a block, give each variable the value it has on
     * leaving the block's predecessors. Where those values differ,
     * insert a phi node and use its result.
     */
    export function* enterBlock(): Process<void> {
      const state: State = yield { type: "peek" };
      const { block } = state;
      // A block with no predecessors (the entry block, or the merge
      // block of an if whose arms all return) has nothing to inherit
      if (block.predecessors.size === 0) {
        return;
      }

      // Blocks.terminate records a block's exit when it makes the block
      // a predecessor, so every predecessor has one
      const exits = [...block.predecessors].map((pred) => {
        const exit = state.function.exits?.get(pred);
        if (!exit) {
          throw new Error(`Block ${pred} has no recorded exit`);
        }
        return { pred, exit };
      });

      const stack = state.scopes.stack;
      for (let scopeIndex = 0; scopeIndex < stack.length; scopeIndex++) {
        for (const [name, ssaVar] of stack[scopeIndex].ssaVars) {
          const temps = exits.map(
            ({ exit }) => exit[scopeIndex]?.get(name)?.currentTempId,
          );
          if (temps.some((temp) => temp === undefined)) {
            continue;
          }

          let tempId = temps[0]!;
          if (temps.some((temp) => temp !== tempId)) {
            tempId = yield* newTemp();
            yield* lift(State.Block.addPhi)({
              kind: "phi",
              dest: tempId,
              sources: new Map(
                exits.map(({ pred }, index) => [
                  pred,
                  Ir.Value.temp(temps[index]!, ssaVar.type),
                ]),
              ),
              type: ssaVar.type,
              // No debug context - compiler-generated phi node (SSA merge point)
              operationDebug: {},
            });
            yield* addSsaMetadata(
              tempId,
              name,
              `scope_${scopeIndex}_${name}`,
              ssaVar.type,
              ssaVar.version + 1,
            );
          }

          if (tempId !== ssaVar.currentTempId) {
            yield* lift(State.Scopes.update)(({ stack }) => ({
              stack: stack.map((scope, index) =>
                index !== scopeIndex
                  ? scope
                  : {
                      ...scope,
                      ssaVars: new Map([
                        ...scope.ssaVars,
                        [name, { ...ssaVar, currentTempId: tempId }],
                      ]),
                    },
              ),
            }));
          }
        }
      }
    }

    /**
     * Update the current temp for an SSA variable
     */
    const updateSsaTemp = function* (
      name: string,
      newTempId: string,
    ): Process<void> {
      const scopes = yield* lift(State.Scopes.extract)((s) => s.stack);
      let scopeIndex = -1;

      // Find which scope has this variable
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (scopes[i].ssaVars.has(name)) {
          scopeIndex = i;
          break;
        }
      }

      if (scopeIndex === -1) return;

      const targetScope = scopes[scopeIndex];
      const currentVar = targetScope.ssaVars.get(name)!;

      // Update with new temp
      const updatedVar: State.SsaVariable = {
        ...currentVar,
        currentTempId: newTempId,
      };

      const updatedScope = {
        ...targetScope,
        ssaVars: new Map([...targetScope.ssaVars, [name, updatedVar]]),
      };

      // Rebuild the scope stack
      const newStack = [
        ...scopes.slice(0, scopeIndex),
        updatedScope,
        ...scopes.slice(scopeIndex + 1),
      ];

      yield* lift(State.Scopes.update)(() => ({ stack: newStack }));
    };

    /**
     * Update an SSA variable to point to an existing temp without
     * creating a new one. The new version aliases the temp: debug info
     * records where the version is defined, here, apart from the temp's
     * own definition.
     */
    export function* updateSsaToExistingTemp(
      name: string,
      existingTempId: string,
      type: Ir.Type,
    ): Process<void> {
      const scopes = yield* lift(State.Scopes.extract)((s) => s.stack);
      let scopeIndex = -1;

      // Find which scope has this variable
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (scopes[i].ssaVars.has(name)) {
          scopeIndex = i;
          break;
        }
      }

      if (scopeIndex === -1) {
        // Variable doesn't exist, create it in current scope
        // But use the existing temp instead of creating a new one
        const scope = yield* lift(State.Scopes.current)();
        const version = (scope.ssaVars.get(name)?.version ?? -1) + 1;

        const ssaVar: State.SsaVariable = {
          name,
          currentTempId: existingTempId,
          type,
          version,
        };

        // Update scope with new SSA variable
        const newScope = {
          ...scope,
          ssaVars: new Map([...scope.ssaVars, [name, ssaVar]]),
          usedNames: new Map([...scope.usedNames, [name, version + 1]]),
        };

        yield* lift(State.Scopes.setCurrent)(newScope);

        // Track SSA metadata for the existing temp
        const scopeId = `scope_${scopeIndex === -1 ? 0 : scopeIndex}_${name}`;
        yield* addSsaMetadata(existingTempId, name, scopeId, type, version, {
          alias: true,
        });
        return;
      }

      const targetScope = scopes[scopeIndex];
      const currentVar = targetScope.ssaVars.get(name)!;
      const newVersion = currentVar.version + 1;

      // Update with the existing temp instead of creating a new one
      const updatedVar: State.SsaVariable = {
        name,
        currentTempId: existingTempId,
        type,
        version: newVersion,
      };

      const updatedScope = {
        ...targetScope,
        ssaVars: new Map([...targetScope.ssaVars, [name, updatedVar]]),
      };

      // Rebuild the scope stack
      const newStack = [
        ...scopes.slice(0, scopeIndex),
        updatedScope,
        ...scopes.slice(scopeIndex + 1),
      ];

      yield* lift(State.Scopes.update)(() => ({ stack: newStack }));

      // Track SSA metadata for the existing temp
      const scopeId = `scope_${scopeIndex}_${name}`;
      yield* addSsaMetadata(existingTempId, name, scopeId, type, newVersion, {
        alias: true,
      });
    }

    /**
     * Generate a new temporary variable ID
     */
    export function* newTemp(): Process<string> {
      const temp = yield* lift(State.Counters.nextTemp)();
      const id = `t${temp}`;
      yield* lift(State.Counters.consumeTemp)();
      return id;
    }

    /**
     * Enter a new scope
     */
    export const enterScope = lift(State.Scopes.push);

    /**
     * Exit the current scope
     */
    export const exitScope = lift(State.Scopes.pop);

    /**
     * Capture current state of all variables for loop phi insertion
     */
    export function* captureCurrentVariables(): Process<
      Map<string, { tempId: string; type: Ir.Type }>
    > {
      const scopes = yield* lift(State.Scopes.extract)((s) => s.stack);
      const result = new Map<string, { tempId: string; type: Ir.Type }>();

      // Capture the innermost definition of each variable: an outer one
      // it shadows cannot change while the shadow is in scope
      for (const scope of [...scopes].reverse()) {
        for (const [name, ssaVar] of scope.ssaVars) {
          if (!result.has(name)) {
            result.set(name, {
              tempId: ssaVar.currentTempId,
              type: ssaVar.type,
            });
          }
        }
      }

      return result;
    }

    /**
     * Create phi nodes for loop variables at loop header (deprecated - use createAndInsertLoopPhis)
     */
    export function createLoopPhis(
      preLoopVars: Map<string, { tempId: string; type: Ir.Type }>,
      _headerBlockId: string,
    ): Map<
      string,
      { phiTemp: string; varName: string; type: Ir.Type; initialTemp: string }
    > {
      const loopPhis = new Map<
        string,
        { phiTemp: string; varName: string; type: Ir.Type; initialTemp: string }
      >();

      // Track which variables exist before the loop
      for (const [varName, { tempId, type }] of preLoopVars) {
        // We'll track this for creating phi nodes later
        loopPhis.set(varName, {
          phiTemp: "", // Will be set when we create the actual phi
          varName,
          type,
          initialTemp: tempId, // The temp value before entering the loop
        });
      }

      return loopPhis;
    }

    /**
     * Create and insert phi nodes for loop variables at loop header
     * This creates placeholder phis with initial values, to be updated later
     */
    export function* createAndInsertLoopPhis(
      preLoopVars: Map<string, { tempId: string; type: Ir.Type }>,
      headerBlockId: string,
    ): Process<
      Map<
        string,
        { phiTemp: string; varName: string; type: Ir.Type; initialTemp: string }
      >
    > {
      const loopPhis = new Map<
        string,
        { phiTemp: string; varName: string; type: Ir.Type; initialTemp: string }
      >();

      const state: State = yield { type: "peek" };
      const headerBlock = state.function.blocks.get(headerBlockId);
      if (!headerBlock) {
        return loopPhis;
      }

      // Find the entry predecessor (the block before the loop)
      const entryPredecessor = Array.from(headerBlock.predecessors).find(
        (pred) => pred !== headerBlockId,
      );

      if (!entryPredecessor) {
        return loopPhis;
      }

      // We should already be in the header block when this is called
      // Create phi nodes for all variables that exist before the loop
      for (const [varName, { tempId, type }] of preLoopVars) {
        const phiTemp = yield* newTemp();

        // Create a placeholder phi with only the entry value for now
        // The loop-back value will be added later in updateLoopPhis
        const sources = new Map<string, Ir.Value>();
        sources.set(entryPredecessor, Ir.Value.temp(tempId, type));

        const phi: Ir.Block.Phi = {
          kind: "phi",
          dest: phiTemp,
          sources,
          type,
          operationDebug: {},
        };

        // Add the phi to the current block (header block) state
        yield* lift(State.Block.addPhi)(phi);

        // Track SSA metadata for the phi
        const scopeIndex = yield* lift(State.Scopes.extract)(
          (s) => s.stack.length - 1,
        );
        const scopeId = `scope_${scopeIndex}_${varName}`;
        yield* addSsaMetadata(phiTemp, varName, scopeId, type, 0);

        // Update the SSA variable to use the phi result
        // This is crucial: from this point forward in the header block,
        // all uses of this variable will reference the phi node
        yield* updateSsaTemp(varName, phiTemp);

        // Track the phi for later update
        loopPhis.set(varName, {
          phiTemp,
          varName,
          type,
          initialTemp: tempId,
        });
      }

      return loopPhis;
    }

    /**
     * Update loop phi nodes with values from the loop body
     * This adds the loop-back edge to the phi nodes created by createAndInsertLoopPhis
     */
    export function* updateLoopPhis(
      loopPhis: Map<
        string,
        { phiTemp: string; varName: string; type: Ir.Type; initialTemp: string }
      >,
      fromBlockId: string,
      headerBlockId: string,
    ): Process<void> {
      const state: State = yield { type: "peek" };
      const headerBlock = state.function.blocks.get(headerBlockId);
      if (!headerBlock) return;

      // Get current values of all loop variables
      const currentVars = yield* captureCurrentVariables();

      for (const [varName, loopPhi] of loopPhis) {
        const currentVar = currentVars.get(varName);
        if (!currentVar) continue;

        // Find the existing phi node for this variable
        const existingPhi = headerBlock.phis.find(
          (phi) => phi.dest === loopPhi.phiTemp,
        );

        if (existingPhi) {
          // Update the existing phi node with the loop-back value
          yield {
            type: "modify",
            fn: (s: State) => {
              const updatedBlock = s.function.blocks.get(headerBlockId);
              if (!updatedBlock) return s;

              const updatedPhis = updatedBlock.phis.map((phi) => {
                if (phi.dest === loopPhi.phiTemp) {
                  // Add the loop-back source
                  const newSources = new Map(phi.sources);
                  newSources.set(
                    fromBlockId,
                    Ir.Value.temp(currentVar.tempId, loopPhi.type),
                  );
                  return {
                    ...phi,
                    sources: newSources,
                  };
                }
                return phi;
              });

              return {
                ...s,
                function: {
                  ...s.function,
                  blocks: new Map([
                    ...s.function.blocks,
                    [
                      headerBlockId,
                      {
                        ...updatedBlock,
                        phis: updatedPhis,
                      },
                    ],
                  ]),
                },
              };
            },
          };
        }
      }
    }
  }

  /**
   * Control flow context management
   */
  export namespace ControlFlow {
    /**
     * Enter a loop context
     */
    export const enterLoop = lift(State.Loops.push);

    /**
     * Exit the current loop context
     */
    export const exitLoop = lift(State.Loops.pop);

    /**
     * Get the current loop context
     */
    export function* currentLoop(): Process<State.Loop | null> {
      const state: State = yield { type: "peek" };
      const loop = state.loops.stack[state.loops.stack.length - 1];
      return loop || null;
    }
  }

  /**
   * Function building operations
   */
  export namespace Functions {
    /**
     * Initialize a new function context
     */
    export function* initialize(
      name: string,
      parameters: { name: string; type: Ir.Type; loc?: Ast.SourceLocation }[],
    ): Process<void> {
      // Convert parameters to SSA form
      const ssaParams: Ir.Function.Parameter[] = [];
      const paramSsaVars = new Map<string, State.SsaVariable>();
      const ssaMetadata = new Map<string, Ir.Function.SsaVariable>();

      for (const param of parameters) {
        const tempId = `t${ssaParams.length}`;
        const ssaParam: Ir.Function.Parameter = {
          name: param.name,
          type: param.type,
          tempId,
        };
        ssaParams.push(ssaParam);

        // Track SSA variable for the parameter
        paramSsaVars.set(param.name, {
          name: param.name,
          currentTempId: tempId,
          type: param.type,
          version: 0,
        });

        // Track SSA metadata for phi insertion
        ssaMetadata.set(tempId, {
          name: param.name,
          scopeId: "param",
          type: param.type,
          version: 0,
          ...(param.loc ? { loc: param.loc } : {}),
        });
      }

      // Create function context
      const functionContext: State.Function = {
        id: name,
        parameters: ssaParams,
        blocks: new Map(),
        ssaMetadata,
      };

      // Create initial block context
      const blockContext: State.Block = {
        id: "entry",
        instructions: [],
        terminator: undefined,
        predecessors: new Set(),
        phis: [],
      };

      // Update state with new contexts
      yield {
        type: "modify",
        fn: (state: State) => ({
          ...state,
          function: functionContext,
          block: blockContext,
          scopes: { stack: [{ ssaVars: paramSsaVars, usedNames: new Map() }] },
          loops: { stack: [] },
          counters: { ...state.counters, block: 1, temp: parameters.length },
        }),
      };
    }

    /**
     * Get the current function's blocks
     */
    export function* currentBlocks(): Process<Map<string, Ir.Block>> {
      const state: State = yield { type: "peek" };
      return state.function.blocks;
    }

    /**
     * Get the current function's parameters
     */
    export function* currentParameters(): Process<Ir.Function.Parameter[]> {
      const state: State = yield { type: "peek" };
      return state.function.parameters;
    }

    /**
     * Finalize the current function
     */
    export function* finalize(): Process<Ir.Function> {
      // Sync final block
      yield* Blocks.syncCurrent();

      const state: State = yield { type: "peek" };
      const func = state.function;

      return {
        name: func.id,
        parameters: func.parameters,
        entry: "entry",
        blocks: func.blocks,
      };
    }

    /**
     * Collect SSA variable metadata for phi insertion
     */
    export function* collectSsaMetadata(): Process<
      Map<string, Ir.Function.SsaVariable>
    > {
      const state: State = yield { type: "peek" };
      // Return the SSA metadata that we've been tracking in the function state
      return state.function.ssaMetadata || new Map();
    }

    /**
     * Add a function to the module
     */
    export const addToModule = lift(State.Module.addFunction);
  }

  export namespace Modules {
    export function* current(): Process<State.Module> {
      const state: State = yield { type: "peek" };
      return state.module;
    }
  }

  export namespace Debug {
    /**
     * Generate debug context for an AST node
     *
     * Includes:
     * - Code source location (if node has loc)
     * - Variables context (all storage variables with known locations)
     *
     * This automatically attaches all available debug information to instructions.
     */
    export function* forAstNode(node: Ast.Node): Process<Ir.Instruction.Debug> {
      const variablesContext = yield* withStorageVariables();

      if (!node.loc) {
        // No code location, but might have variables
        return variablesContext;
      }

      const { offset, length } = node.loc;
      const { sourceId: id } = yield* Process.Modules.current();

      // Combine code and variables in a single context object
      // No need for gather since the keys don't conflict
      const context: Format.Program.Context = {
        code: {
          source: { id },
          range: { offset, length },
        },
        // Add variables if available
        ...(Format.Program.Context.isVariables(variablesContext.context)
          ? { variables: variablesContext.context.variables }
          : {}),
      };

      return { context };
    }

    /**
     * Generate variables context for all storage variables
     *
     * This includes variables with determinable runtime locations:
     * - Storage variables (with fixed slots)
     * - Memory allocations (when tracked)
     *
     * SSA temps are NOT included as they don't have concrete locations
     * until EVM code generation.
     */
    export function* withStorageVariables(): Process<Ir.Instruction.Debug> {
      const state: State = yield { type: "peek" };
      const id = state.module.name;

      const variables = collectVariablesWithLocations(state, id);

      if (variables.length === 0) {
        return {};
      }

      return {
        context: {
          variables: variables.map(toVariableContextEntry),
        },
      };
    }
  }

  /**
   * Storage operations
   */
  export namespace Storage {
    /**
     * Find a storage slot by name
     */
    export function* findSlot(name: string): Process<{
      slot: number;
      name: string;
      declaration: Ast.Declaration.Storage;
    } | null> {
      const state: State = yield { type: "peek" };
      const storageDecl = state.module.storageDeclarations.find(
        (decl) => decl.name === name,
      );

      if (!storageDecl) return null;

      return {
        slot: storageDecl.slot,
        name: storageDecl.name,
        declaration: storageDecl,
      };
    }

    /**
     * Emit a compute_slot instruction
     */
    export function* computeSlot(
      baseSlot: Ir.Value,
      key: Ir.Value,
      node?: Ast.Node,
    ): Process<Ir.Value> {
      const tempId = yield* Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "compute_slot",
        slotKind: "mapping",
        base: baseSlot,
        key,
        dest: tempId,
        operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
      } as Ir.Instruction.ComputeSlot);
      return Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
    }

    /**
     * Emit a load_storage instruction
     */
    export function* load(
      slot: Ir.Value,
      type: Ir.Type,
      node?: Ast.Node,
    ): Process<Ir.Value> {
      const tempId = yield* Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "storage",
        slot,
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        type,
        dest: tempId,
        operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
      } as Ir.Instruction.Read);
      return Ir.Value.temp(tempId, type);
    }

    /**
     * Emit a write instruction for storage
     */
    export function* store(
      slot: Ir.Value,
      value: Ir.Value,
      node?: Ast.Node,
    ): Process<void> {
      yield* Process.Instructions.emit({
        kind: "write",
        location: "storage",
        slot,
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        value,
        operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
      } as Ir.Instruction.Write);
    }
  }

  /**
   * Error handling
   */
  export namespace Errors {
    /**
     * Report an error
     */
    export const report = lift(State.Errors.append);

    export const count = lift(State.Errors.count);

    /**
     * Report a warning
     */
    export const warning = lift(State.Warnings.append);

    /**
     * Attempt an operation, catching IrgenErrors
     */
    export const attempt = lift(State.Errors.attempt);
  }

  /**
   * Run a process with an initial state
   */
  export function run<T>(
    process: Process<T>,
    initialState: State,
  ): { state: State; value: T } {
    let state = initialState;
    let next = process.next();

    while (!next.done) {
      const action = next.value;

      switch (action.type) {
        case "modify": {
          state = action.fn(state);
          next = process.next(state);
          break;
        }
        case "peek": {
          next = process.next(state);
          break;
        }
        case "value": {
          // This is for returning values without state changes
          next = process.next(state);
          break;
        }
        default:
          assertExhausted(action);
      }
    }

    return { state, value: next.value };
  }
}

// Overloaded signatures for different return types
function lift<A extends readonly unknown[]>(
  fn: (...args: A) => Modify<State>,
): (...args: A) => Process<void>;

function lift<T, A extends readonly unknown[]>(
  fn: (...args: A) => Read<State, T>,
): (...args: A) => Process<T>;

// Implementation
function lift<T, A extends readonly unknown[]>(
  fn: (...args: A) => Modify<State> | Read<State, T>,
) {
  return function* (...args: A): Process<T | void> {
    const result = fn(...args);

    if (isModify<State>(result)) {
      yield {
        type: "modify",
        fn: result,
      };
      return;
    }

    if (isRead<State, T>(result)) {
      return result(yield { type: "peek" });
    }

    assertExhausted(result);
  };
}
