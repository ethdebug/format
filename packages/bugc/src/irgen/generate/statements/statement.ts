import type * as Ast from "#ast";
import { assertExhausted } from "#irgen/errors";

import { Process } from "../process.js";

import { makeBuildBlock } from "./block.js";

import { buildExpressionStatement } from "./express.js";
import { buildDeclarationStatement } from "./declare.js";
import { makeBuildControlFlowStatement } from "./control-flow.js";
import { buildAssignmentStatement } from "./assign.js";

const buildControlFlowStatement = makeBuildControlFlowStatement(buildStatement);

export const buildBlock = makeBuildBlock(buildStatement);

/**
 * Build a statement
 */
export function* buildStatement(stmt: Ast.Statement): Process<void> {
  switch (stmt.kind) {
    case "statement:declare":
      return yield* buildDeclarationStatement(stmt as Ast.Statement.Declare);
    case "statement:assign":
      return yield* buildAssignmentStatement(stmt as Ast.Statement.Assign);
    case "statement:control-flow:if":
    case "statement:control-flow:for":
    case "statement:control-flow:while":
    case "statement:control-flow:return":
    case "statement:control-flow:break":
    case "statement:control-flow:continue":
      return yield* buildControlFlowStatement(
        stmt as Ast.Statement.ControlFlow,
      );
    case "statement:express":
      return yield* buildExpressionStatement(stmt as Ast.Statement.Express);
    default:
      assertExhausted(stmt);
  }
}
