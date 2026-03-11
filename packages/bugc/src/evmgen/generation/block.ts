/**
 * Block-level code generation
 */

import type * as Ast from "#ast";
import type * as Format from "@ethdebug/format";
import * as Ir from "#ir";
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

      // Initialize memory for first block
      if (isFirstBlock) {
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
          const returnCtx: Format.Program.Context.Return = {
            return: {
              identifier: calledFunction,
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
              // Spill return value to memory: DUP1, PUSH offset, MSTORE
              return {
                ...s,
                instructions: [
                  ...s.instructions,
                  {
                    mnemonic: "DUP1" as const,
                    opcode: 0x80,
                    debug: spillDebug,
                  },
                  {
                    mnemonic: "PUSH2" as const,
                    opcode: 0x61,
                    immediates: [
                      (allocation.offset >> 8) & 0xff,
                      allocation.offset & 0xff,
                    ],
                    debug: spillDebug,
                  },
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

      // Process phi nodes if we have a predecessor
      if (predecessor && block.phis.length > 0) {
        result = result.then(generatePhis(block.phis, predecessor));
      }

      // Process regular instructions
      for (const inst of block.instructions) {
        result = result.then(Instruction.generate(inst));
      }

      // Process terminator
      // Handle call terminators specially (they cross function boundaries)
      if (block.terminator.kind === "call") {
        result = result.then(generateCallTerminator(block.terminator));
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
  const { PUSHn, MSTORE } = operations;

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
        return builder
          .then(PUSHn(BigInt(allocation.offset)), { as: "offset" })
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

  return pipe<S>()
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
    .done();
}
