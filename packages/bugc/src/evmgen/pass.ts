import * as Format from "@ethdebug/format";
import { Result } from "#result";
import type { Pass } from "#compiler";
import type * as Ir from "#ir";
import type * as Evm from "#evm";

import { Module } from "#evmgen/generation";
import { Error as EvmgenError, ErrorCode } from "#evmgen/errors";
import { buildProgram } from "#evmgen/program-builder";

import { Layout, Liveness, Memory } from "#evmgen/analysis";

/**
 * Output produced by the EVM generation pass
 */
export interface EvmGenerationOutput {
  /** Runtime bytecode */
  runtime: Uint8Array;
  /** Constructor bytecode (optional) */
  create?: Uint8Array;
  /** Runtime instructions */
  runtimeInstructions: Evm.Instruction[];
  /** Constructor instructions (optional) */
  createInstructions?: Evm.Instruction[];
  /** Runtime program with debug info (ethdebug/format) */
  runtimeProgram: Format.Program;
  /** Create program with debug info (ethdebug/format, optional) */
  createProgram?: Format.Program;
}

/**
 * EVM code generation pass
 */
const pass: Pass<{
  needs: {
    ir: Ir.Module;
  };
  adds: {
    bytecode: EvmGenerationOutput;
  };
  error: EvmgenError;
}> = {
  async run({ ir }) {
    try {
      // Analyze liveness
      const liveness = Liveness.Module.analyze(ir);

      // Analyze memory requirements
      const memoryResult = Memory.Module.plan(ir, liveness);
      if (!memoryResult.success) {
        return Result.err(
          new EvmgenError(
            ErrorCode.INTERNAL_ERROR,
            memoryResult.messages.error?.[0]?.message ??
              "Memory analysis failed",
          ),
        );
      }

      // Analyze block layout
      const blockResult = Layout.Module.perform(ir);
      if (!blockResult.success) {
        return Result.err(
          new EvmgenError(
            ErrorCode.INTERNAL_ERROR,
            blockResult.messages.error?.[0]?.message ??
              "Block layout analysis failed",
          ),
        );
      }

      // Generate bytecode
      const result = Module.generate(ir, memoryResult.value, blockResult.value);

      // Convert to Uint8Array
      const runtime = new Uint8Array(result.runtime);
      const create = result.create ? new Uint8Array(result.create) : undefined;

      // Build Format.Program objects
      const runtimeProgram = buildProgram(
        result.runtimeInstructions,
        "call",
        ir,
      );
      const createProgram = result.createInstructions
        ? buildProgram(result.createInstructions, "create", ir)
        : undefined;

      return Result.okWith(
        {
          bytecode: {
            runtime,
            create,
            runtimeInstructions: result.runtimeInstructions,
            createInstructions: result.createInstructions,
            runtimeProgram,
            createProgram,
          },
        },
        result.warnings,
      );
    } catch (error) {
      if (error instanceof EvmgenError) {
        return Result.err(error);
      }

      // Wrap unexpected errors
      return Result.err(
        new EvmgenError(
          ErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  },
};

export default pass;
