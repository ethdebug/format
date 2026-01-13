import { testSchemaGuards } from "../../../test/guards";
import { isProgram } from "./program";

testSchemaGuards("ethdebug/format/program", [
  {
    schema: "schema:ethdebug/format/program",
    guard: isProgram,
  },
] as const);
