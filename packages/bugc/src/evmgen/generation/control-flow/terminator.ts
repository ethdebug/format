import type * as Format from "@ethdebug/format";
import type * as Ir from "#ir";
import type { Stack } from "#evm";
import type { State } from "#evmgen/state";

import { type Transition, operations, pipe } from "#evmgen/operations";

import { valueId, loadValue } from "../values/index.js";

/**
 * Generate code for a block terminator
 */
export function generateTerminator<S extends Stack>(
  term: Ir.Block.Terminator,
  isLastBlock: boolean = false,
  isUserFunction: boolean = false,
): Transition<S, S> {
  const { PUSHn, PUSH2, MSTORE, MLOAD, RETURN, STOP, JUMP, JUMPI } = operations;

  switch (term.kind) {
    case "return": {
      // Internal function return: load return PC, jump back
      // Note: For returns with a value, we assume the return value is already
      // on TOS from the previous instruction in the block. This avoids an
      // unnecessary DUP that would leave an extra value on the stack.
      if (isUserFunction) {
        // Load return PC from the saved slot (not 0x60,
        // which may have been overwritten by nested calls).
        // Use operationDebug from the IR return terminator
        // so the epilogue maps back to the return statement.
        const debug = term.operationDebug;
        return pipe<S>()
          .peek((state, builder) => {
            const pcOffset = state.memory.savedReturnPcOffset ?? 0x60;
            return builder
              .then(PUSHn(BigInt(pcOffset), { debug }), { as: "offset" })
              .then(MLOAD({ debug }), { as: "counter" })
              .then(JUMP({ debug }));
          })
          .done() as unknown as Transition<S, S>;
      }

      // Contract return (main function or create)
      if (term.value) {
        const value = term.value;
        const id = valueId(value);

        return pipe<S>()
          .peek((state, builder) => {
            const allocation = state.memory.allocations[id];

            if (allocation === undefined) {
              const offset = state.memory.nextStaticOffset;
              return builder
                .then(loadValue(value))
                .then(PUSHn(BigInt(offset)), { as: "offset" })
                .then(MSTORE())
                .then(PUSHn(32n), { as: "size" })
                .then(PUSHn(BigInt(offset)), { as: "offset" })
                .then(RETURN());
            } else {
              const offset = allocation.offset;
              return builder
                .then(PUSHn(32n), { as: "size" })
                .then(PUSHn(BigInt(offset)), { as: "offset" })
                .then(RETURN());
            }
          })
          .done();
      } else {
        return isLastBlock ? (state) => state : pipe<S>().then(STOP()).done();
      }
    }

    case "jump": {
      return pipe<S>()
        .peek((state, builder) => {
          const patchIndex = state.instructions.length;

          return builder
            .then(PUSH2([0, 0]), { as: "counter" })
            .then(JUMP())
            .then((newState) => ({
              ...newState,
              patches: [
                ...newState.patches,
                {
                  index: patchIndex,
                  target: term.target,
                },
              ],
            }));
        })
        .done();
    }

    case "branch": {
      return pipe<S>()
        .then(loadValue(term.condition), { as: "b" })
        .peek((state, builder) => {
          // Record offset for true target patch
          const trueIndex = state.instructions.length;

          return builder
            .then(PUSH2([0, 0]), { as: "counter" })
            .then(JUMPI())
            .peek((state2, builder2) => {
              // Record offset for false target patch
              const falseIndex = state2.instructions.length;

              return builder2
                .then(PUSH2([0, 0]), { as: "counter" })
                .then(JUMP())
                .then((finalState) => ({
                  ...finalState,
                  patches: [
                    ...finalState.patches,
                    {
                      index: trueIndex,
                      target: term.trueTarget,
                    },
                    {
                      index: falseIndex,
                      target: term.falseTarget,
                    },
                  ],
                }));
            });
        })
        .done();
    }

    case "call":
      // Call terminators should be handled specially in block.ts
      throw new Error(
        "Call terminator should be handled by generateCallTerminator",
      );
  }
}

/**
 * Generate code for a call terminator - handled specially
 * since it crosses function boundaries
 */
export function generateCallTerminator<S extends Stack>(
  term: Extract<Ir.Block.Terminator, { kind: "call" }>,
  functions?: Map<string, Ir.Function>,
): Transition<S, Stack> {
  const funcName = term.function;
  const args = term.arguments;
  const cont = term.continuation;
  const targetFunc = functions?.get(funcName);

  return ((state: State<S>): State<Stack> => {
    let currentState: State<Stack> = state as State<Stack>;

    // All call setup instructions map back to the call
    // expression source location via operationDebug.
    const debug = term.operationDebug;

    // Clean the stack before setting up the call.
    // Values produced by block instructions that are only
    // used as call arguments will have been DUP'd by
    // loadValue, leaving originals behind. Since this is a
    // block terminator, all current stack values are dead
    // after the call — POP them so the function receives a
    // clean stack with only its arguments.
    while (currentState.stack.length > 0) {
      currentState = {
        ...currentState,
        instructions: [
          ...currentState.instructions,
          { mnemonic: "POP", opcode: 0x50, debug },
        ],
        stack: currentState.stack.slice(1),
        brands: currentState.brands.slice(1) as Stack,
      };
    }

    const returnPcPatchIndex = currentState.instructions.length;

    // Store return PC to memory at 0x60
    currentState = {
      ...currentState,
      instructions: [
        ...currentState.instructions,
        {
          mnemonic: "PUSH2",
          opcode: 0x61,
          immediates: [0, 0],
          debug,
        },
        {
          mnemonic: "PUSH1",
          opcode: 0x60,
          immediates: [0x60],
          debug,
        },
        { mnemonic: "MSTORE", opcode: 0x52, debug },
      ],
      patches: [
        ...currentState.patches,
        {
          type: "continuation" as const,
          index: returnPcPatchIndex,
          target: cont,
        },
      ],
    };

    // Push arguments using loadValue.
    // Stack is clean, so loadValue will reload from memory
    // (for temps) or re-push (for consts).
    for (const arg of args) {
      currentState = loadValue(arg, { debug })(currentState);
    }

    // Push function address and jump.
    // The JUMP gets an invoke context: after JUMP executes,
    // the function has been entered with args on the stack.
    const funcAddrPatchIndex = currentState.instructions.length;

    // Build argument pointers: after the JUMP, the callee
    // sees args on the stack in order (first arg deepest).
    const params = targetFunc?.parameters;
    const argPointers = args.map((_arg, i) => ({
      ...(params?.[i]?.name ? { name: params[i].name } : {}),
      location: "stack" as const,
      slot: args.length - 1 - i,
    }));

    // Build declaration source range if available
    const declaration =
      targetFunc?.loc && targetFunc?.sourceId
        ? {
            source: { id: targetFunc.sourceId },
            range: targetFunc.loc,
          }
        : undefined;

    // Invoke context describes state after JUMP executes:
    // the callee has been entered with args on the stack.
    // target points to the function address at stack slot 0
    // (consumed by JUMP, but describes the call target).
    const invoke: Format.Program.Context.Invoke = {
      invoke: {
        jump: true as const,
        identifier: funcName,
        ...(declaration ? { declaration } : {}),
        target: {
          pointer: {
            location: "stack" as const,
            slot: 0,
          },
        },
        ...(argPointers.length > 0 && {
          arguments: {
            pointer: {
              group: argPointers,
            },
          },
        }),
      },
    };
    const invokeContext = { context: invoke as Format.Program.Context };

    currentState = {
      ...currentState,
      instructions: [
        ...currentState.instructions,
        {
          mnemonic: "PUSH2",
          opcode: 0x61,
          immediates: [0, 0],
          debug,
        },
        { mnemonic: "JUMP", opcode: 0x56, debug: invokeContext },
      ],
      patches: [
        ...currentState.patches,
        {
          type: "function" as const,
          index: funcAddrPatchIndex,
          target: funcName,
        },
      ],
    };

    // Reset stack tracking to match the runtime state at the
    // continuation block. The function call consumes all args
    // and leaves just the return value (if any) on the stack.
    if (term.dest) {
      currentState = {
        ...currentState,
        stack: [{ id: `call_return_${funcName}`, irValue: term.dest }],
        brands: ["value" as const] as unknown as Stack,
      };
    } else {
      currentState = {
        ...currentState,
        stack: [],
        brands: [] as unknown as Stack,
      };
    }

    return currentState;
  }) as Transition<S, Stack>;
}
