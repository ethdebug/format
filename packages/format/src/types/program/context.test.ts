import { testSchemaGuards } from "#test/guards";
import { Context, isContext } from "./context.js";

testSchemaGuards("ethdebug/format/program/context", [
  {
    schema: "schema:ethdebug/format/program/context",
    guard: isContext,
  },
  {
    schema: "schema:ethdebug/format/program/context/code",
    guard: Context.isCode,
  },
  {
    schema: "schema:ethdebug/format/program/context/variables",
    guard: Context.isVariables,
  },
  {
    schema: "schema:ethdebug/format/program/context/remark",
    guard: Context.isRemark,
  },
  {
    schema: "schema:ethdebug/format/program/context/pick",
    guard: Context.isPick,
  },
  {
    schema: "schema:ethdebug/format/program/context/gather",
    guard: Context.isGather,
  },
  {
    schema: "schema:ethdebug/format/program/context/frame",
    guard: Context.isFrame,
  },
  {
    schema: "schema:ethdebug/format/program/context/function",
    guard: Context.Function.isIdentity,
  },
  {
    schema: "schema:ethdebug/format/program/context/function/invoke",
    guard: Context.isInvoke,
  },
  {
    schema: "schema:ethdebug/format/program/context/function/return",
    guard: Context.isReturn,
  },
  {
    schema: "schema:ethdebug/format/program/context/function/revert",
    guard: Context.isRevert,
  },
] as const);
