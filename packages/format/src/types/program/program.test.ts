import { testSchemaGuards } from "../../../test/guards.js";
import { isProgram } from "./program.js";

testSchemaGuards("ethdebug/format/program", [
  {
    schema: "schema:ethdebug/format/program",
    guard: isProgram,
  },
] as const);
