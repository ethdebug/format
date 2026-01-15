import type { Ast, Ir, Evm } from "@ethdebug/bugc";

export interface BytecodeOutput {
  runtime: Uint8Array;
  create?: Uint8Array;
  runtimeInstructions: Evm.Instruction[];
  createInstructions?: Evm.Instruction[];
}

export interface SuccessfulCompileResult {
  success: true;
  ast: Ast.Program;
  ir: Ir.Module;
  bytecode: BytecodeOutput;
  warnings: string[];
}

export interface FailedCompileResult {
  success: false;
  error: string;
  ast?: Ast.Program;
  warnings?: string[];
}

export type CompileResult = SuccessfulCompileResult | FailedCompileResult;
