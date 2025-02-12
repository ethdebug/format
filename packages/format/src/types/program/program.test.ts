import { testSchemaGuards } from "../../../test/guards";
import { Program, isProgram } from "./program";

testSchemaGuards("ethdebug/format/program", [
  {
    schema: "schema:ethdebug/format/program",
    guard: isProgram
  },
] as const);
