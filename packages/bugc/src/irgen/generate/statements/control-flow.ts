import * as Ast from "#ast";
import * as Ir from "#ir";
import { Error as IrgenError, assertExhausted } from "#irgen/errors";
import { Severity } from "#result";
import { buildExpression } from "../expressions/index.js";

import { makeBuildBlock } from "./block.js";

import { Process } from "../process.js";
import type { State } from "../state.js";

/**
 * Build a control flow statement
 */
export const makeBuildControlFlowStatement = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) => {
  const buildIfStatement = makeBuildIfStatement(buildStatement);
  const buildWhileStatement = makeBuildWhileStatement(buildStatement);
  const buildForStatement = makeBuildForStatement(buildStatement);

  return function* buildControlFlowStatement(
    stmt: Ast.Statement.ControlFlow,
  ): Process<void> {
    switch (stmt.kind) {
      case "statement:control-flow:if":
        return yield* buildIfStatement(stmt as Ast.Statement.ControlFlow.If);
      case "statement:control-flow:while":
        return yield* buildWhileStatement(
          stmt as Ast.Statement.ControlFlow.While,
        );
      case "statement:control-flow:for":
        return yield* buildForStatement(stmt as Ast.Statement.ControlFlow.For);
      case "statement:control-flow:return":
        return yield* buildReturnStatement(
          stmt as Ast.Statement.ControlFlow.Return,
        );
      case "statement:control-flow:break":
        return yield* buildBreakStatement(
          stmt as Ast.Statement.ControlFlow.Break,
        );
      case "statement:control-flow:continue":
        return yield* buildContinueStatement(
          stmt as Ast.Statement.ControlFlow.Continue,
        );
      default:
        assertExhausted(stmt);
    }
  };
};

/**
 * Build an if statement
 */
export const makeBuildIfStatement = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) => {
  const buildBlock = makeBuildBlock(buildStatement);
  return function* buildIfStatement(
    stmt: Ast.Statement.ControlFlow.If,
  ): Process<void> {
    const thenBlock = yield* Process.Blocks.create("then");
    const elseBlock = stmt.alternate
      ? yield* Process.Blocks.create("else")
      : yield* Process.Blocks.create("merge");
    const mergeBlock = stmt.alternate
      ? yield* Process.Blocks.create("merge")
      : elseBlock; // For no-else case, elseBlock IS the merge block

    // Evaluate condition
    const condVal = yield* buildExpression(stmt.condition!, { kind: "rvalue" });

    // Branch to then or else/merge
    yield* Process.Blocks.terminate({
      kind: "branch",
      condition: condVal,
      trueTarget: thenBlock,
      falseTarget: elseBlock,
      operationDebug: yield* Process.Debug.forAstNode(stmt),
    });

    // Build then block
    yield* Process.Blocks.switchTo(thenBlock);
    yield* buildBlock(stmt.body!);

    {
      const terminator = yield* Process.Blocks.currentTerminator();
      // Only set terminator if block doesn't have one
      if (!terminator) {
        yield* Process.Blocks.terminate({
          kind: "jump",
          target: mergeBlock,
          operationDebug: yield* Process.Debug.forAstNode(stmt),
        });
      }
    }

    // Build else block if it exists
    if (stmt.alternate) {
      yield* Process.Blocks.switchTo(elseBlock);
      yield* buildBlock(stmt.alternate);

      const terminator = yield* Process.Blocks.currentTerminator();
      if (!terminator) {
        yield* Process.Blocks.terminate({
          kind: "jump",
          target: mergeBlock,
          operationDebug: yield* Process.Debug.forAstNode(stmt),
        });
      }
    }

    // Continue in merge block
    yield* Process.Blocks.switchTo(mergeBlock);
  };
};

/**
 * Unified loop builder for while and for loops
 */
const makeBuildLoop = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) =>
  function* buildLoop(config: {
    init?: Ast.Statement;
    condition?: Ast.Expression;
    update?: Ast.Statement;
    body: Ast.Block;
    prefix: string;
    node?: Ast.Node;
  }): Process<void> {
    const buildBlock = makeBuildBlock(buildStatement);

    // Execute init statement if present (for loops)
    if (config.init) {
      yield* buildStatement(config.init);
    }

    // Create blocks
    const headerBlock = yield* Process.Blocks.create(`${config.prefix}_header`);
    const bodyBlock = yield* Process.Blocks.create(`${config.prefix}_body`);
    const exitBlock = yield* Process.Blocks.create(`${config.prefix}_exit`);

    // For 'for' loops, we need an update block
    const updateBlock = config.update
      ? yield* Process.Blocks.create(`${config.prefix}_update`)
      : null;

    // Track variables before entering loop for phi insertion
    const preLoopVars = yield* Process.Variables.captureCurrentVariables();

    // Jump to header
    yield* Process.Blocks.terminate({
      kind: "jump",
      target: headerBlock,
      operationDebug: config.node
        ? yield* Process.Debug.forAstNode(config.node)
        : {},
    });

    // Header: evaluate condition and branch
    yield* Process.Blocks.switchTo(headerBlock);

    // On first entry to header, create phi nodes for loop variables
    // We need to create placeholder phis NOW so that the condition uses them
    const loopPhis = yield* Process.Variables.createAndInsertLoopPhis(
      preLoopVars,
      headerBlock,
    );

    const condVal = config.condition
      ? yield* buildExpression(config.condition, { kind: "rvalue" })
      : Ir.Value.constant(1n, Ir.Type.Scalar.bool); // infinite loop if no condition

    yield* Process.Blocks.terminate({
      kind: "branch",
      condition: condVal,
      trueTarget: bodyBlock,
      falseTarget: exitBlock,
      operationDebug: config.node
        ? yield* Process.Debug.forAstNode(config.node)
        : {},
    });

    // Body: execute loop body
    yield* Process.Blocks.switchTo(bodyBlock);

    // Set up loop context (continue target depends on whether we have update)
    const continueTarget = updateBlock || headerBlock;
    yield* Process.ControlFlow.enterLoop(continueTarget, exitBlock);

    yield* buildBlock(config.body);

    yield* Process.ControlFlow.exitLoop();

    // Jump to update block (for loop) or header (while loop)
    {
      const terminator = yield* Process.Blocks.currentTerminator();
      if (!terminator) {
        yield* Process.Blocks.terminate({
          kind: "jump",
          target: continueTarget,
          operationDebug: config.node
            ? yield* Process.Debug.forAstNode(config.node)
            : {},
        });
      }
    }

    // Update block (only for 'for' loops)
    if (updateBlock && config.update) {
      yield* Process.Blocks.switchTo(updateBlock);
      yield* buildStatement(config.update);

      // Before jumping back to header, update phi sources with loop values
      yield* Process.Variables.updateLoopPhis(
        loopPhis,
        updateBlock,
        headerBlock,
      );

      const terminator = yield* Process.Blocks.currentTerminator();
      if (!terminator) {
        yield* Process.Blocks.terminate({
          kind: "jump",
          target: headerBlock,
          operationDebug: config.node
            ? yield* Process.Debug.forAstNode(config.node)
            : {},
        });
      }
    } else if (!config.update) {
      // For while loops, update phis before jumping from body to header
      // This needs to happen at the end of the body block
      const state: State = yield { type: "peek" };
      const currentBlockId = state.block.id;
      yield* Process.Variables.updateLoopPhis(
        loopPhis,
        currentBlockId,
        headerBlock,
      );
    }

    // Continue from exit block
    yield* Process.Blocks.switchTo(exitBlock);
  };

/**
 * Build a while statement
 */
export const makeBuildWhileStatement = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) => {
  const buildLoop = makeBuildLoop(buildStatement);
  return function* buildWhileStatement(
    stmt: Ast.Statement.ControlFlow.While,
  ): Process<void> {
    yield* buildLoop({
      condition: stmt.condition,
      body: stmt.body,
      prefix: "while",
      node: stmt,
    });
  };
};

/**
 * Build a for statement
 */
export const makeBuildForStatement = (
  buildStatement: (stmt: Ast.Statement) => Process<void>,
) => {
  const buildLoop = makeBuildLoop(buildStatement);
  return function* buildForStatement(
    stmt: Ast.Statement.ControlFlow.For,
  ): Process<void> {
    yield* buildLoop({
      init: stmt.init,
      condition: stmt.condition,
      update: stmt.update,
      body: stmt.body,
      prefix: "for",
      node: stmt,
    });
  };
};

/**
 * Build a return statement
 */
function* buildReturnStatement(
  stmt: Ast.Statement.ControlFlow.Return,
): Process<void> {
  const value = stmt.value
    ? yield* buildExpression(stmt.value, { kind: "rvalue" })
    : undefined;

  yield* Process.Blocks.terminate({
    kind: "return",
    value,
    operationDebug: yield* Process.Debug.forAstNode(stmt),
  });
}

/**
 * Build a break statement
 */
function* buildBreakStatement(
  stmt: Ast.Statement.ControlFlow.Break,
): Process<void> {
  const loop = yield* Process.ControlFlow.currentLoop();

  if (!loop) {
    yield* Process.Errors.report(
      new IrgenError(
        "Break outside loop",
        stmt.loc ?? undefined,
        Severity.Error,
      ),
    );

    return;
  }

  yield* Process.Blocks.terminate({
    kind: "jump",
    target: loop.breakTarget,
    operationDebug: yield* Process.Debug.forAstNode(stmt),
  });
}

/**
 * Build a continue statement
 */
function* buildContinueStatement(
  stmt: Ast.Statement.ControlFlow.Continue,
): Process<void> {
  const loop = yield* Process.ControlFlow.currentLoop();

  if (!loop) {
    yield* Process.Errors.report(
      new IrgenError(
        "Continue outside loop",
        stmt.loc ?? undefined,
        Severity.Error,
      ),
    );

    return;
  }

  yield* Process.Blocks.terminate({
    kind: "jump",
    target: loop.continueTarget,
    operationDebug: yield* Process.Debug.forAstNode(stmt),
  });
}
