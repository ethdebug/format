import * as Ast from "#ast";
import { Process } from "../process.js";

/**
 * Build a block of statements
 */
export const makeBuildBlock = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) =>
  function* buildBlock(block: Ast.Block): Process<void> {
    yield* Process.Variables.enterScope();

    for (const item of block.items) {
      if (Ast.isStatement(item)) {
        yield* buildStatement(item);
      }
    }

    yield* Process.Variables.exitScope();
  };
