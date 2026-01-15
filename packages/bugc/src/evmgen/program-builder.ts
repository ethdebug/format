/**
 * Build Format.Program objects from EVM generation output
 */

import type * as Format from "@ethdebug/format";
import type * as Evm from "#evm";
import type * as Ir from "#ir";

/**
 * Convert Evm.Instruction to Format.Program.Instruction
 */
function toFormatInstruction(
  instr: Evm.Instruction,
  offset: number,
): Format.Program.Instruction {
  const result: Format.Program.Instruction = {
    offset,
  };

  // Add operation info
  if (instr.mnemonic) {
    const operation: Format.Program.Instruction.Operation = {
      mnemonic: instr.mnemonic,
    };

    // Add immediates as arguments if present
    if (instr.immediates && instr.immediates.length > 0) {
      // Convert immediates to hex string
      const hex =
        "0x" +
        instr.immediates.map((b) => b.toString(16).padStart(2, "0")).join("");
      operation.arguments = [hex];
    }

    result.operation = operation;
  }

  // Add debug context if present
  if (instr.debug?.context) {
    result.context = instr.debug.context;
  }

  return result;
}

/**
 * Compute byte offsets for each instruction
 */
function computeOffsets(instructions: Evm.Instruction[]): number[] {
  const offsets: number[] = [];
  let offset = 0;

  for (const instr of instructions) {
    offsets.push(offset);
    offset += 1 + (instr.immediates?.length ?? 0);
  }

  return offsets;
}

/**
 * Build a Format.Program from EVM instructions and IR module info
 */
export function buildProgram(
  instructions: Evm.Instruction[],
  environment: "call" | "create",
  ir: Ir.Module,
): Format.Program {
  const offsets = computeOffsets(instructions);

  const formatInstructions = instructions.map((instr, i) =>
    toFormatInstruction(instr, offsets[i]),
  );

  // Build contract info from IR module
  const contract: Format.Program.Contract = {
    name: ir.name,
    definition: {
      source: { id: "0" }, // TODO: Get actual source ID
      range: ir.loc ?? { offset: 0, length: 0 },
    },
  };

  const program: Format.Program = {
    contract,
    environment,
    instructions: formatInstructions,
  };

  // Add program-level context if available
  if (ir.debugContext) {
    program.context = ir.debugContext;
  }

  return program;
}
