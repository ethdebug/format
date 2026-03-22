import { testSchemaGuards } from "#test/guards";
import { Materials } from "./index.js";

testSchemaGuards("ethdebug/format/materials", [
  {
    schema: "schema:ethdebug/format/materials/id",
    guard: Materials.isId,
  },
  {
    schema: "schema:ethdebug/format/materials/reference",
    guard: Materials.isReference,
  },
  {
    schema: "schema:ethdebug/format/materials/compilation",
    guard: Materials.isCompilation,
  },
  {
    schema: "schema:ethdebug/format/materials/source",
    guard: Materials.isSource,
  },
  {
    schema: "schema:ethdebug/format/materials/source-range",
    guard: Materials.isSourceRange,
  },
]);
