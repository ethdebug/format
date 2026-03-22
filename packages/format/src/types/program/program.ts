import { Materials } from "#types/materials";

import { Context as _Context, isContext as _isContext } from "./context.js";

import {
  Instruction as _Instruction,
  isInstruction as _isInstruction,
} from "./instruction.js";

export interface Program {
  compilation?: Materials.Reference<Materials.Compilation>;
  contract: Program.Contract;
  environment: Program.Environment;
  context?: Program.Context;
  instructions: Program.Instruction[];
}

export const isProgram = (value: unknown): value is Program =>
  typeof value === "object" &&
  !!value &&
  "contract" in value &&
  Program.isContract(value.contract) &&
  "environment" in value &&
  Program.isEnvironment(value.environment) &&
  "instructions" in value &&
  value.instructions instanceof Array &&
  value.instructions.every(Program.isInstruction) &&
  (!("compilation" in value) ||
    Materials.isReference<Materials.Compilation>(value.compilation)) &&
  (!("context" in value) || Program.isContext(value.context));

export namespace Program {
  export import Context = _Context;
  export const isContext = _isContext;
  export import Instruction = _Instruction;
  export const isInstruction = _isInstruction;
  export type Environment = "call" | "create";

  export const isEnvironment = (value: unknown): value is Environment =>
    typeof value === "string" && ["call", "create"].includes(value);

  export interface Contract {
    name?: string;
    definition: Materials.SourceRange;
  }

  export const isContract = (value: unknown): value is Contract =>
    typeof value === "object" &&
    !!value &&
    "definition" in value &&
    Materials.isSourceRange(value.definition) &&
    (!("name" in value) || typeof value.name === "string");
}
