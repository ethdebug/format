import { testSchemaGuards } from "../../../test/guards";
import { Context, isContext } from "./context";

testSchemaGuards("ethdebug/format/program/context", [
  {
    schema: "schema:ethdebug/format/program/context",
    guard: isContext
  },
  {
    schema: "schema:ethdebug/format/program/context/code",
    guard: Context.isCode
  },
  {
    schema: "schema:ethdebug/format/program/context/variables",
    guard: Context.isVariables
  },
  {
    schema: "schema:ethdebug/format/program/context/remark",
    guard: Context.isRemark
  },
  {
    schema: "schema:ethdebug/format/program/context/frame",
    guard: Context.isFrame
  },
  {
    schema: "schema:ethdebug/format/program/context/pick",
    guard: Context.isPick
  },
] as const);
