import { Data } from "#types/data";

import { Context, isContext } from "./context.js";

export interface Instruction {
  offset: Data.Value;
  context?: Context;
  operation?: Instruction.Operation;
}

export const isInstruction = (value: unknown): value is Instruction =>
  typeof value === "object" &&
  !!value &&
  "offset" in value &&
  Data.isValue(value.offset) &&
  (!("context" in value) || isContext(value.context)) &&
  (!("operation" in value) || Instruction.isOperation(value.operation));

export namespace Instruction {
  export interface Operation {
    mnemonic: string;
    arguments?: Data.Value[];
  }

  export const isOperation = (value: unknown): value is Operation =>
    typeof value === "object" &&
    !!value &&
    "mnemonic" in value &&
    typeof value.mnemonic === "string" &&
    (!("arguments" in value) ||
      (value.arguments instanceof Array &&
        value.arguments.every(Data.isValue)));
}
