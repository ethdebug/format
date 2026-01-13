import { testSchemaGuards } from "../../../test/guards";
import * as Base from "./base";

testSchemaGuards("ethdebug/format/type/base", [
  {
    schema: "schema:ethdebug/format/type/base",
    pointer: "#/$defs/ElementaryType",
    guard: Base.isElementary,
  },
  {
    schema: "schema:ethdebug/format/type/base",
    pointer: "#/$defs/ComplexType",
    guard: Base.isComplex,
  },
  {
    schema: "schema:ethdebug/format/type/base",
    pointer: "#/$defs/TypeWrapper",
    guard: Base.isWrapper,
  },
] as const);
