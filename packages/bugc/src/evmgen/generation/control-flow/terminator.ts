import type * as Format from "@ethdebug/format";
import type * as Ir from "#ir";
import type * as Evm from "#evm";
import type { Stack } from "#evm";
import type { State } from "#evmgen/state";
import { Memory } from "#evmgen/analysis";

import { type Transition, operations, pipe } from "#evmgen/operations";

import { valueId, loadValue } from "../values/index.js";

/**
 * Generate code for a block terminator
 */
export function generateTerminator<S extends Stack>(
  term: Ir.Block.Terminator,
  isLastBlock: boolean = false,
  isUserFunction: boolean = false,
): Transition<S, Stack> {
  const { PUSHn, PUSH2, MSTORE, RETURN, STOP, JUMP, JUMPI } = operations;

  switch (term.kind) {
    case "return": {
      // Internal function return: load return PC, jump back
      // Note: For returns with a value, we assume the return value is already
      // on TOS from the previous instruction in the block. This avoids an
      // unnecessary DUP that would leave an extra value on the stack.
      if (isUserFunction) {
        // Internal function return epilogue.
        // Uses the same imperative pattern as
        // generateCallTerminator — returns
        // Transition<S, Stack> to erase output type.
        const debug = term.operationDebug;
        return generateReturnEpilogue(term.value, debug);
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
      // When this jump replaces a tail-recursive call (TCO),
      // attach a gather context to the JUMP combining the
      // previous iteration's return and the new iteration's
      // invoke. Depth stays constant: one pops, one pushes,
      // on the same instruction. The function's terminal
      // RETURN pops the final iteration's frame normally.
      const invokeOptions = term.tailCall
        ? buildTailCallJumpOptions(term.tailCall)
        : undefined;

      return pipe<S>()
        .peek((state, builder) => {
          const patchIndex = state.instructions.length;

          return builder
            .then(PUSH2([0, 0]), { as: "counter" })
            .then(JUMP(invokeOptions))
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
    // The JUMP gets a simplified invoke context with
    // identity and code target only; the full invoke
    // with arg pointers lives on the callee JUMPDEST.
    const funcAddrPatchIndex = currentState.instructions.length;

    // Build declaration source range if available
    const declaration =
      targetFunc?.loc && targetFunc?.sourceId
        ? {
            source: { id: targetFunc.sourceId },
            range: targetFunc.loc,
          }
        : undefined;

    const invoke: Format.Program.Context.Invoke = {
      invoke: {
        jump: true as const,
        identifier: funcName,
        ...(declaration ? { declaration } : {}),
        target: {
          pointer: {
            location: "code" as const,
            offset: 0,
            length: 1,
          },
        },
      },
    };
    const invokeContext = {
      context: invoke as Format.Program.Context,
    };

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

/**
 * Generate return epilogue for user-defined functions.
 *
 * Loads the return value (if any), cleans stale stack
 * values from predecessor blocks, then loads the saved
 * return PC and jumps back to the caller.
 */
function generateReturnEpilogue<S extends Stack>(
  value: Ir.Value | undefined,
  debug: Ir.Block.Debug,
): Transition<S, Stack> {
  return ((state: State<S>): State<Stack> => {
    let s: State<Stack> = state as State<Stack>;

    // Load return value onto the stack if present.
    if (value) {
      s = loadValue(value, { debug })(s);
    }

    // Pop stale values, keeping only the return value
    // (if any). Multi-block functions can accumulate
    // leftover values (e.g. branch condition results)
    // from predecessor blocks.
    const keep = value ? 1 : 0;
    while (s.stack.length > keep) {
      if (keep > 0 && s.stack.length > 1) {
        const depth = s.stack.length - 1;
        s = {
          ...s,
          instructions: [
            ...s.instructions,
            {
              mnemonic: `SWAP${depth}`,
              opcode: 0x8f + depth,
              debug,
            },
          ],
          stack: [s.stack[depth], ...s.stack.slice(1, depth), s.stack[0]],
          brands: [
            s.brands[depth],
            ...s.brands.slice(1, depth),
            s.brands[0],
          ] as Stack,
        };
      }
      s = {
        ...s,
        instructions: [
          ...s.instructions,
          { mnemonic: "POP", opcode: 0x50, debug },
        ],
        stack: s.stack.slice(1),
        brands: s.brands.slice(1) as Stack,
      };
    }

    // Deallocate frame and jump to saved return PC.
    //
    // fp = mem[FRAME_POINTER]
    // return_pc = mem[fp + SAVED_RETURN_PC]
    // old_fp = mem[fp + SAVED_FP]  (= mem[fp])
    // mem[FRAME_POINTER] = old_fp
    // mem[FREE_MEMORY_POINTER] = fp  (deallocate)
    // JUMP return_pc
    const FP = Memory.regions.FRAME_POINTER;
    const FMP = Memory.regions.FREE_MEMORY_POINTER;
    const pcOff = Memory.frameHeader.SAVED_RETURN_PC;

    s = {
      ...s,
      instructions: [
        ...s.instructions,
        // fp
        ...pushImm(FP, debug),
        { mnemonic: "MLOAD", opcode: 0x51, debug },
        // Stack: [fp, ...]

        // return_pc = mem[fp + SAVED_RETURN_PC]
        { mnemonic: "DUP1", opcode: 0x80, debug },
        ...pushImm(pcOff, debug),
        { mnemonic: "ADD", opcode: 0x01, debug },
        { mnemonic: "MLOAD", opcode: 0x51, debug },
        // Stack: [return_pc, fp, ...]

        // old_fp = mem[fp] (SAVED_FP offset is 0)
        { mnemonic: "SWAP1", opcode: 0x90, debug },
        // Stack: [fp, return_pc, ...]
        { mnemonic: "DUP1", opcode: 0x80, debug },
        { mnemonic: "MLOAD", opcode: 0x51, debug },
        // Stack: [old_fp, fp, return_pc, ...]

        // mem[FRAME_POINTER] = old_fp
        { mnemonic: "DUP1", opcode: 0x80, debug },
        ...pushImm(FP, debug),
        { mnemonic: "MSTORE", opcode: 0x52, debug },
        // Stack: [old_fp, fp, return_pc, ...]

        // mem[FREE_MEMORY_POINTER] = fp (deallocate)
        { mnemonic: "POP", opcode: 0x50, debug },
        // Stack: [fp, return_pc, ...]
        ...pushImm(FMP, debug),
        { mnemonic: "MSTORE", opcode: 0x52, debug },
        // Stack: [return_pc, ...]

        // JUMP
        { mnemonic: "JUMP", opcode: 0x56, debug },
      ],
    };

    return s;
  }) as Transition<S, Stack>;
}

/**
 * Build JUMP instruction options for a TCO-replaced tail call.
 *
 * The JUMP carries BOTH discriminators on a single flat
 * context object:
 *   - return: the previous iteration's return
 *   - invoke: the new iteration's call
 *
 * Semantically the debugger sees frame depth stay constant
 * across the back-edge JUMP: the previous frame pops, the
 * new one pushes, on the same instruction. The function's
 * terminal RETURN (elsewhere) emits a return context
 * normally, popping the final iteration's frame.
 *
 * The invoke mirrors the normal caller-JUMP invoke
 * (identity + declaration + code target, no argument
 * pointers). The return omits `data` because TCO does not
 * materialize the intermediate return value — the actual
 * return happens later at the function's terminal RETURN.
 *
 * The invoke target uses placeholder offset 0 and is
 * resolved later by patchInvokeTarget.
 */
function buildTailCallJumpOptions(tailCall: Ir.Block.TailCall): {
  debug: { context: Format.Program.Context };
} {
  const declaration =
    tailCall.declarationLoc && tailCall.declarationSourceId
      ? {
          source: { id: tailCall.declarationSourceId },
          range: tailCall.declarationLoc,
        }
      : undefined;

  const combined: Format.Program.Context.Return &
    Format.Program.Context.Invoke = {
    return: {
      identifier: tailCall.function,
      ...(declaration ? { declaration } : {}),
    },
    invoke: {
      jump: true as const,
      identifier: tailCall.function,
      ...(declaration ? { declaration } : {}),
      target: {
        pointer: {
          location: "code" as const,
          offset: 0,
          length: 1,
        },
      },
    },
  };

  return { debug: { context: combined as Format.Program.Context } };
}

/** PUSH an integer as the smallest PUSHn. */
function pushImm(value: number, debug: Ir.Block.Debug): Evm.Instruction[] {
  if (value === 0) {
    return [{ mnemonic: "PUSH0", opcode: 0x5f, debug }];
  }
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  const n = bytes.length;
  return [
    {
      mnemonic: `PUSH${n}`,
      opcode: 0x5f + n,
      immediates: bytes,
      debug,
    },
  ];
}
