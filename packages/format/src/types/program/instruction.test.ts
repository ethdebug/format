import { testSchemaGuards } from "../../../test/guards";
import { Instruction, isInstruction } from "./instruction";

testSchemaGuards("ethdebug/format/program/instruction", [
  {
    schema: "schema:ethdebug/format/program/instruction",
    guard: isInstruction
  },
] as const);
