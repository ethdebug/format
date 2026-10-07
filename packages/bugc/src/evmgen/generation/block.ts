/**
 * Block-level code generation
 */

import type * as Ast from "#ast";
import type * as Format from "@ethdebug/format";
import * as Ir from "#ir";
import type * as Evm from "#evm";
import type { Stack } from "#evm";

import { Error, ErrorCode } from "#evmgen/errors";
import { type Transition, pipe, operations } from "#evmgen/operations";
import { Memory } from "#evmgen/analysis";
import { calculateSize } from "#evmgen/serialize";

import * as Instruction from "./instruction.js";
import { bracketActivation, carriesActivation } from "./bracket-activation.js";
import { loadValue } from "./values/index.js";
import {
  generateTerminator,
  generateCallTerminator,
} from "./control-flow/index.js";
import { annotateTop } from "./values/identify.js";
import { withReturned, withStackLocals } from "../debug/local-variables.js";

/**
 * Generate code for a basic block
 */
export function generate<S extends Stack>(
  block: Ir.Block,
  predecessor?: string,
  isLastBlock: boolean = false,
  isFirstBlock: boolean = false,
  isUserFunction: boolean = false,
  func?: Ir.Function,
  functions?: Map<string, Ir.Function>,
): Transition<S, Stack> {
  const { JUMPDEST } = operations;

  return pipe<S>()
    .peek((state, builder) => {
      // Record block offset for jump patching (byte offset, not instruction index)
      const blockOffset = calculateSize(state.instructions);

      let result = builder.then((s) => ({
        ...s,
        blockOffsets: {
          ...s.blockOffsets,
          [block.id]: blockOffset,
        },
      }));

      // Initialize memory for first block of main/create.
      // User functions allocate frames in the prologue
      // instead — re-initializing here would clobber FP/FMP.
      if (isFirstBlock && !isUserFunction) {
        const sourceInfo =
          func?.sourceId && func?.loc
            ? { sourceId: func.sourceId, loc: func.loc }
            : undefined;
        result = result.then(
          initializeMemory(state.memory.nextStaticOffset, sourceInfo),
        );
      }

      // Set JUMPDEST for non-first blocks
      if (!isFirstBlock) {
        // A call's continuation resumes at the call expression, so its
        // JUMPDEST carries the call site's source range. The callee's
        // exit JUMP already carries the `return`.
        let callSiteCode: Format.Program.Context.Code["code"] | undefined;
        if (func && predecessor) {
          const predBlock = func.blocks.get(predecessor);
          if (
            predBlock?.terminator.kind === "call" &&
            predBlock.terminator.continuation === block.id
          ) {
            const ctx = predBlock.terminator.operationDebug?.context as
              | Record<string, unknown>
              | undefined;
            if (ctx && "code" in ctx) {
              callSiteCode = ctx.code as Format.Program.Context.Code["code"];
            }
          }
        }

        if (callSiteCode) {
          const entry = block.entryDebug;
          const continuationDebug = {
            ...entry,
            context: {
              ...entry?.context,
              code: callSiteCode,
            } as Format.Program.Context,
          };
          result = result.then(JUMPDEST({ debug: continuationDebug }));
        } else {
          result = result.then(JUMPDEST({ debug: block.entryDebug }));
        }

        // Annotate TOS with dest variable if this is a continuation with return value.
        // Also spill to memory if allocated, so the value survives stack cleanup
        // before any subsequent call terminators.
        if (func && predecessor) {
          const predBlock = func.blocks.get(predecessor);
          if (
            predBlock?.terminator.kind === "call" &&
            predBlock.terminator.continuation === block.id &&
            predBlock.terminator.dest
          ) {
            const destId = predBlock.terminator.dest;
            const spillDebug = predBlock.terminator.operationDebug;
            result = result.then(annotateTop(destId)).then((s) => {
              const allocation = s.memory.allocations[destId];
              if (!allocation) return s;
              // Spill return value to memory.
              // DUP1 keeps the value; compute address; MSTORE.
              return {
                ...s,
                instructions: [
                  ...s.instructions,
                  {
                    mnemonic: "DUP1" as const,
                    opcode: 0x80,
                    debug: spillDebug,
                  },
                  ...computeAddress(
                    allocation.offset,
                    s.memory.frameSize !== undefined,
                    spillDebug,
                  ),
                  // The stack after the store is the stack before
                  // the DUP1.
                  withStackLocals(
                    {
                      mnemonic: "MSTORE" as const,
                      opcode: 0x52,
                      debug: spillDebug?.stored ?? spillDebug,
                    },
                    s.stack,
                  ),
                ],
              };
            });
          }
        }
      }

      // Phi resolution happens at predecessors, not at the
      // target. Each predecessor stores its phi source values
      // into the phi destination memory slots before jumping.
      // This is necessary for back-edges (loops, TCO) where
      // the runtime predecessor differs from the layout-order
      // predecessor.

      // Process regular instructions. Invoke/return activation
      // discriminators must be bracketed to the first/last emitted op
      // of the instruction (see bracket-activation.ts); everything else
      // (source mapping, variables, transform markers) rides all ops.
      const msgDataIds = findMsgDataIds(
        func ?? { blocks: new Map([[block.id, block]]) },
      );
      for (const inst of block.instructions) {
        const gen = Instruction.generate(inst, msgDataIds);
        const operationCtx = inst.operationDebug?.context;
        if (
          !carriesActivation(operationCtx, "invoke") &&
          !carriesActivation(operationCtx, "return")
        ) {
          result = result.then(gen);
          continue;
        }
        const returned = inst.operationDebug?.returned;
        result = result.peek((state, builder) => {
          const start = state.instructions.length;
          return builder.then(gen).then((s) => {
            const instructions = [
              ...bracketActivation(s.instructions, start, operationCtx),
            ];
            // The op that returns from an inlined function lists the
            // caller's variables
            if (returned && instructions.length > start) {
              instructions[instructions.length - 1] = withReturned(
                instructions[instructions.length - 1],
                returned,
                s.stack,
              );
            }
            return { ...s, instructions };
          });
        });
      }

      // Emit phi copies for successor blocks before the
      // terminator. For jump terminators, check if the
      // target has phis and store the source values for
      // this block. A branch cannot store them for one
      // target only, so a branch into a block with phis
      // must go through an edge block (see split-edges.ts).
      if (func && block.terminator.kind === "jump") {
        const target = func.blocks.get(block.terminator.target);
        if (target && target.phis.length > 0) {
          result = result.then(
            generatePhis(
              target.phis,
              block.id,
              block.terminator.operationDebug,
            ),
          );
        }
      } else if (func && block.terminator.kind === "branch") {
        for (const targetId of [
          block.terminator.trueTarget,
          block.terminator.falseTarget,
        ]) {
          if ((func.blocks.get(targetId)?.phis.length ?? 0) > 0) {
            throw new Error(
              ErrorCode.PHI_NODE_UNRESOLVED,
              `Branch from ${block.id} into ${targetId}, which has phis`,
            );
          }
        }
      }

      // Process terminator
      // Handle call terminators specially
      // (they cross function boundaries)
      const term = block.terminator;
      const terminate =
        term.kind === "call"
          ? generateCallTerminator(term, functions)
          : generateTerminator(term, isLastBlock, isUserFunction, func);
      // A terminator carries an inlined function's invoke or return
      // only when its block has no instruction to carry it (an
      // inlined function that starts with a call, or returns a call's
      // result): bracket it as for an instruction. A call's own JUMP
      // carries the call's invoke, so it is left out.
      const termCtx = term.operationDebug?.context;
      if (
        (term.kind === "call" || (term.kind === "jump" && !term.tailCall)) &&
        (carriesActivation(termCtx, "invoke") ||
          carriesActivation(termCtx, "return"))
      ) {
        result = result.peek((state, builder) => {
          const start = state.instructions.length;
          return builder.then(terminate).then((s) => ({
            ...s,
            instructions: bracketActivation(
              s.instructions,
              start,
              termCtx,
              s.instructions.length - (term.kind === "call" ? 1 : 0),
            ),
          }));
        });
      } else {
        result = result.then(terminate);
      }

      return result;
    })
    .done();
}

/**
 * Generate code for the phi nodes of the block that `predecessor`
 * jumps to. The phis copy in parallel: one phi's source may be another
 * phi's destination (as when a loop swaps two locals), so load every
 * source before storing any destination.
 */
function generatePhis<S extends Stack>(
  phis: Ir.Block.Phi[],
  predecessor: string,
  debug: Ir.Block.Debug,
): Transition<S, S> {
  // The stack grows by one per load and shrinks by one per store,
  // which the types cannot follow across a list
  const steps = [
    ...phis.map((phi) => loadPhiSource<Stack>(phi, predecessor, debug)),
    ...phis.map((phi) => storePhiDest<Stack>(phi, debug)).reverse(),
  ] as unknown as Transition<S, S>[];
  return (state) => steps.reduce((current, step) => step(current), state);
}

function loadPhiSource<S extends Stack>(
  phi: Ir.Block.Phi,
  predecessor: string,
  debug: Ir.Block.Debug,
): Transition<S, readonly ["value", ...S]> {
  const source = phi.sources.get(predecessor);
  if (!source) {
    throw new Error(
      ErrorCode.PHI_NODE_UNRESOLVED,
      `Phi ${phi.dest} missing source from ${predecessor}`,
    );
  }

  return loadValue(source, { debug });
}

function storePhiDest<S extends Stack>(
  phi: Ir.Block.Phi,
  debug: Ir.Block.Debug,
): Transition<readonly ["value", ...S], S> {
  const { PUSHn, ADD, MLOAD, MSTORE } = operations;

  return pipe<readonly ["value", ...S]>()
    .peek((state, builder) => {
      const allocation = state.memory.allocations[phi.dest];
      if (allocation === undefined) {
        throw new Error(
          ErrorCode.MEMORY_ALLOCATION_FAILED,
          `Phi destination ${phi.dest} not allocated`,
        );
      }
      if (state.memory.frameSize !== undefined) {
        return builder
          .then(PUSHn(BigInt(Memory.regions.FRAME_POINTER), { debug }), {
            as: "offset",
          })
          .then(MLOAD({ debug }), { as: "b" })
          .then(PUSHn(BigInt(allocation.offset), { debug }), {
            as: "a",
          })
          .then(ADD({ debug }), { as: "offset" })
          .then(MSTORE({ debug }));
      }
      return builder
        .then(PUSHn(BigInt(allocation.offset), { debug }), {
          as: "offset",
        })
        .then(MSTORE({ debug }));
    })
    .done();
}

/**
 * Initialize the free memory pointer at runtime
 * Sets the value at 0x40 to the next available memory location
 * after static allocations
 */
function initializeMemory<S extends Stack>(
  nextStaticOffset: number,
  sourceInfo?: { sourceId: string; loc: Ast.SourceLocation },
): Transition<S, S> {
  const { PUSHn, MSTORE } = operations;

  const debug = sourceInfo
    ? {
        context: {
          code: {
            source: { id: sourceInfo.sourceId },
            range: sourceInfo.loc,
          },
        } as Format.Program.Context,
      }
    : {
        context: {
          remark: "initialize free memory pointer",
        } as Format.Program.Context,
      };

  const { PUSH0 } = operations;

  return (
    pipe<S>()
      .then(PUSHn(BigInt(nextStaticOffset), { debug }), {
        as: "value",
      })
      .then(
        PUSHn(BigInt(Memory.regions.FREE_MEMORY_POINTER), {
          debug,
        }),
        { as: "offset" },
      )
      .then(MSTORE({ debug }))
      // Initialize frame pointer to 0 (no active frame)
      .then(PUSH0({ debug }), { as: "value" })
      .then(PUSHn(BigInt(Memory.regions.FRAME_POINTER), { debug }), {
        as: "offset",
      })
      .then(MSTORE({ debug }))
      .done()
  );
}

/**
 * Emit instructions to compute a memory address.
 *
 * For frame-based functions, emits PUSH FP; MLOAD;
 * PUSH offset; ADD. For absolute mode, emits PUSH2
 * with the offset encoded directly.
 */
function computeAddress(
  offset: number,
  isFrameBased: boolean,
  debug: Evm.Instruction["debug"],
): Evm.Instruction[] {
  if (isFrameBased) {
    return [
      ...pushImm(Memory.regions.FRAME_POINTER, debug),
      { mnemonic: "MLOAD" as const, opcode: 0x51, debug },
      ...pushImm(offset, debug),
      { mnemonic: "ADD" as const, opcode: 0x01, debug },
    ];
  }
  return [
    {
      mnemonic: "PUSH2" as const,
      opcode: 0x61,
      immediates: [(offset >> 8) & 0xff, offset & 0xff],
      debug,
    },
  ];
}

/** PUSH an integer as the smallest PUSHn. */
function pushImm(
  value: number,
  debug: Evm.Instruction["debug"],
): Evm.Instruction[] {
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

/**
 * Find the temps that hold msg.data: the dests of `msg_data` env
 * instructions anywhere in the function.
 */
function findMsgDataIds(func: {
  blocks: ReadonlyMap<string, Ir.Block>;
}): Set<string> {
  const ids = new Set<string>();
  for (const block of func.blocks.values()) {
    for (const inst of block.instructions) {
      if (inst.kind === "env" && inst.op === "msg_data") {
        ids.add(inst.dest);
      }
    }
  }
  return ids;
}
