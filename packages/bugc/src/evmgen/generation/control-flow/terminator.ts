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
        return pipe<S>()
          .peek((state, builder) => {
            const pcOffset = state.memory.savedReturnPcOffset ?? 0x60;
            const returnDebug = {
              context: {
                remark: term.value
                  ? "function-return: return with value"
                  : "function-return: void return",
              },
            };
            return builder
              .then(PUSHn(BigInt(pcOffset), { debug: returnDebug }), {
                as: "offset",
              })
              .then(MLOAD({ debug: returnDebug }), {
                as: "counter",
              })
              .then(JUMP({ debug: returnDebug }));
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
 * Generate code for a call terminator - handled specially since it crosses function boundaries
 */
export function generateCallTerminator<S extends Stack>(
  term: Extract<Ir.Block.Terminator, { kind: "call" }>,
): Transition<S, Stack> {
  const funcName = term.function;
  const args = term.arguments;
  const cont = term.continuation;

  return ((state: State<S>): State<Stack> => {
    let currentState: State<Stack> = state as State<Stack>;

    // Clean the stack before setting up the call.
    // Values produced by block instructions that are only
    // used as call arguments will have been DUP'd by
    // loadValue, leaving originals behind. Since this is a
    // block terminator, all current stack values are dead
    // after the call — POP them so the function receives a
    // clean stack with only its arguments.
    const cleanupDebug = {
      context: {
        remark: `call-preparation: clean stack for ${funcName}`,
      },
    };
    while (currentState.stack.length > 0) {
      currentState = {
        ...currentState,
        instructions: [
          ...currentState.instructions,
          { mnemonic: "POP", opcode: 0x50, debug: cleanupDebug },
        ],
        stack: currentState.stack.slice(1),
        brands: currentState.brands.slice(1) as Stack,
      };
    }

    const returnPcPatchIndex = currentState.instructions.length;

    // Store return PC to memory at 0x60
    const returnPcDebug = {
      context: {
        remark: `call-preparation: store return address for ${funcName}`,
      },
    };
    currentState = {
      ...currentState,
      instructions: [
        ...currentState.instructions,
        {
          mnemonic: "PUSH2",
          opcode: 0x61,
          immediates: [0, 0],
          debug: returnPcDebug,
        },
        { mnemonic: "PUSH1", opcode: 0x60, immediates: [0x60] },
        { mnemonic: "MSTORE", opcode: 0x52 },
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
    const argsDebug = {
      context: {
        remark: `call-arguments: push ${args.length} argument(s) for ${funcName}`,
      },
    };
    for (const arg of args) {
      currentState = loadValue(arg, { debug: argsDebug })(currentState);
    }

    // Push function address and jump
    const funcAddrPatchIndex = currentState.instructions.length;
    const invocationDebug = {
      context: {
        remark: `call-invocation: jump to function ${funcName}`,
      },
    };
    currentState = {
      ...currentState,
      instructions: [
        ...currentState.instructions,
        {
          mnemonic: "PUSH2",
          opcode: 0x61,
          immediates: [0, 0],
          debug: invocationDebug,
        },
        { mnemonic: "JUMP", opcode: 0x56 },
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
