import { testSchemaGuards } from "../../../test/guards.js";
import { isInstruction } from "./instruction.js";

testSchemaGuards("ethdebug/format/program/instruction", [
  {
    schema: "schema:ethdebug/format/program/instruction",
    guard: isInstruction,
  },
] as const);
