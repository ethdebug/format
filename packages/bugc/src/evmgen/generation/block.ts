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
import { loadValue } from "./values/index.js";
import {
  generateTerminator,
  generateCallTerminator,
} from "./control-flow/index.js";
import { annotateTop } from "./values/identify.js";

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
        // Check if this is a call continuation
        let isContinuation = false;
        let calledFunction = "";
        if (func && predecessor) {
          const predBlock = func.blocks.get(predecessor);
          if (
            predBlock?.terminator.kind === "call" &&
            predBlock.terminator.continuation === block.id
          ) {
            isContinuation = true;
            calledFunction = predBlock.terminator.function;
          }
        }

        // Add JUMPDEST with continuation annotation if applicable
        if (isContinuation) {
          // Return context describes state after JUMPDEST
          // executes: TOS is the return value (if any).
          // data pointer is required by the schema; for
          // void returns, slot 0 is still valid (empty).
          const calledFunc = functions?.get(calledFunction);
          const declaration =
            calledFunc?.loc && calledFunc?.sourceId
              ? {
                  source: { id: calledFunc.sourceId },
                  range: calledFunc.loc,
                }
              : undefined;
          const returnCtx: Format.Program.Context.Return = {
            return: {
              identifier: calledFunction,
              ...(declaration ? { declaration } : {}),
              data: {
                pointer: {
                  location: "stack" as const,
                  slot: 0,
                },
              },
            },
          };
          const continuationDebug = {
            context: returnCtx as Format.Program.Context,
          };
          result = result.then(JUMPDEST({ debug: continuationDebug }));
        } else {
          result = result.then(JUMPDEST());
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
                  {
                    mnemonic: "MSTORE" as const,
                    opcode: 0x52,
                    debug: spillDebug,
                  },
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

      // Process regular instructions
      for (const inst of block.instructions) {
        result = result.then(Instruction.generate(inst));
      }

      // Emit phi copies for successor blocks before the
      // terminator. For jump terminators, check if the
      // target has phis and store the source values for
      // this block.
      if (func && block.terminator.kind === "jump") {
        const target = func.blocks.get(block.terminator.target);
        if (target && target.phis.length > 0) {
          const relevant = target.phis.filter((phi) =>
            phi.sources.has(block.id),
          );
          if (relevant.length > 0) {
            result = result.then(generatePhis(relevant, block.id));
          }
        }
      }

      // Process terminator
      // Handle call terminators specially
      // (they cross function boundaries)
      if (block.terminator.kind === "call") {
        result = result.then(
          generateCallTerminator(block.terminator, functions),
        );
      } else {
        result = result.then(
          generateTerminator(block.terminator, isLastBlock, isUserFunction),
        );
      }

      return result;
    })
    .done();
}

/**
 * Generate code for phi nodes
 */
function generatePhis<S extends Stack>(
  phis: Ir.Block.Phi[],
  predecessor: string,
): Transition<S, S> {
  return phis
    .reduce(
      (builder, phi) => builder.then(generatePhi(phi, predecessor)),
      pipe<S>(),
    )
    .done();
}

function generatePhi<S extends Stack>(
  phi: Ir.Block.Phi,
  predecessor: string,
): Transition<S, S> {
  const { PUSHn, ADD, MLOAD, MSTORE } = operations;

  const source = phi.sources.get(predecessor);
  if (!source) {
    throw new Error(
      ErrorCode.PHI_NODE_UNRESOLVED,
      `Phi ${phi.dest} missing source from ${predecessor}`,
    );
  }

  return (
    pipe<S>()
      // Load source value and store to phi destination
      .then(loadValue(source))
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
            .then(PUSHn(BigInt(Memory.regions.FRAME_POINTER)), { as: "offset" })
            .then(MLOAD(), { as: "b" })
            .then(PUSHn(BigInt(allocation.offset)), {
              as: "a",
            })
            .then(ADD(), { as: "offset" })
            .then(MSTORE());
        }
        return builder
          .then(PUSHn(BigInt(allocation.offset)), {
            as: "offset",
          })
          .then(MSTORE());
      })
      .done()
  );
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
          gather: [
            { remark: "initialize free memory pointer" },
            {
              code: {
                source: { id: sourceInfo.sourceId },
                range: sourceInfo.loc,
              },
            },
          ],
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
