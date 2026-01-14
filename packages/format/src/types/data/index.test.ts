import { testSchemaGuards } from "../../../test/guards.js";

import { Data } from "./index.js";

testSchemaGuards("ethdebug/format/data", [
  {
    schema: "schema:ethdebug/format/data/value",
    guard: Data.isValue,
  },
  {
    schema: "schema:ethdebug/format/data/unsigned",
    guard: Data.isUnsigned,
  },
  {
    schema: "schema:ethdebug/format/data/hex",
    guard: Data.isHex,
  },
]);
