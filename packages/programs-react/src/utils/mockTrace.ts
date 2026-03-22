/**
 * Utilities for creating mock execution traces.
 */

import type { Program } from "@ethdebug/format";

/**
 * A single step in an execution trace.
 */
export interface TraceStep {
  /** Program counter (byte offset in bytecode) */
  pc: number;
  /** Opcode mnemonic (e.g., "PUSH1", "SLOAD") */
  opcode: string;
  /** Stack entries (from top to bottom) as hex strings or bigints */
  stack?: Array<string | bigint>;
  /** Memory contents as hex string */
  memory?: string;
  /** Storage state: slot (hex) → value (hex) */
  storage?: Record<string, string>;
  /** Gas remaining */
  gas?: bigint;
  /** Return data from last call */
  returndata?: string;
}

/**
 * Specification for creating a mock trace.
 */
export interface MockTraceSpec {
  /** Sequence of execution steps */
  steps: TraceStep[];
  /** Program definition with instructions */
  program: Program;
}

/**
 * Create a mock trace from a specification.
 *
 * This allows creating traces for demonstration without running real EVM.
 */
export function createMockTrace(spec: MockTraceSpec): TraceStep[] {
  return spec.steps.map((step) => ({
    ...step,
    // Ensure stack has default value
    stack: step.stack || [],
    // Ensure storage has default value
    storage: step.storage || {},
  }));
}

/**
 * Find the instruction at a given program counter.
 */
export function findInstructionAtPc(
  program: Program,
  pc: number,
): Program.Instruction | undefined {
  return program.instructions?.find((instr) => instr.offset === pc);
}

/**
 * Extract variables that are in scope at a given instruction.
 *
 * This walks the context and extracts variables from Variables contexts.
 */
export function extractVariablesFromInstruction(
  instruction: Program.Instruction,
): Array<{ identifier?: string; type?: unknown; pointer?: unknown }> {
  if (!instruction.context) {
    return [];
  }

  return extractVariablesFromContext(instruction.context);
}

function extractVariablesFromContext(
  context: Program.Context,
): Array<{ identifier?: string; type?: unknown; pointer?: unknown }> {
  // Variables context
  if ("variables" in context && Array.isArray(context.variables)) {
    return context.variables;
  }

  // Gather context (combines multiple contexts)
  if ("gather" in context && Array.isArray(context.gather)) {
    return context.gather.flatMap(extractVariablesFromContext);
  }

  // Pick context (picks from multiple contexts - take first with variables)
  if ("pick" in context && Array.isArray(context.pick)) {
    for (const subContext of context.pick) {
      const vars = extractVariablesFromContext(subContext);
      if (vars.length > 0) {
        return vars;
      }
    }
  }

  return [];
}

/**
 * Build a map of PC to instruction for quick lookup.
 */
export function buildPcToInstructionMap(
  program: Program,
): Map<number, Program.Instruction> {
  const map = new Map<number, Program.Instruction>();
  for (const instr of program.instructions || []) {
    // offset can be number or hex string (Data.Value)
    const offset =
      typeof instr.offset === "string"
        ? parseInt(instr.offset, 16)
        : instr.offset;
    map.set(offset, instr);
  }
  return map;
}
