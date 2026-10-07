import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { buildExpression } from "../expressions/index.js";
import { Process } from "../process.js";
import { emitInMemory } from "../calldata.js";

/**
 * Build a declaration statement
 */
export function* buildDeclarationStatement(
  stmt: Ast.Statement.Declare,
): Process<void> {
  const decl = stmt.declaration;

  switch (decl.kind) {
    case "declaration:variable":
      return yield* buildVariableDeclaration(decl as Ast.Declaration.Variable);
    case "declaration:function":
      // Function declarations are handled at module level
      return;
    case "declaration:parameter":
      // Parameter declarations are part of function handling
      return;
    case "declaration:struct":
      // Struct declarations are handled at module level
      return;
    case "declaration:storage":
      // Storage declarations are handled at module level
      return;
    default:
      return yield* Process.Errors.report(
        new IrgenError(
          `Unsupported declaration kind: ${decl.kind}`,
          stmt.loc ?? undefined,
          Severity.Error,
        ),
      );
  }
}

/**
 * Build a variable declaration
 */
function* buildVariableDeclaration(
  decl: Ast.Declaration.Variable,
): Process<void> {
  // Infer type from the types map or use default
  const type = yield* Process.Types.nodeType(decl);
  const irType = type ? fromBugType(type) : Ir.Type.Scalar.uint256;

  // Check if this is a reference type that needs memory allocation
  // (bytes in calldata need none: the local holds their word)
  const needsMemoryAllocation =
    irType.kind === "ref" && irType.location !== "calldata";

  if (needsMemoryAllocation) {
    // For types that need memory allocation

    // A placeholder allocation, for a local declared without an
    // initializer; with one, the local's value is the initializer's
    const sizeValue = Ir.Value.constant(64n, Ir.Type.Scalar.uint256);

    // Allocate memory
    const allocTemp = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "allocate",
      location: "memory",
      size: sizeValue,
      dest: allocTemp,
      operationDebug: yield* Process.Debug.forAstNode(decl),
    } as Ir.Instruction);

    // Declare the SSA variable and directly use the allocTemp as its value
    // With an initializer, the local's value is the initializer's
    // (below), not this allocation.
    const builtLater = !!decl.initializer;
    yield* Process.Variables.declareWithExistingTemp(
      decl.name,
      irType,
      allocTemp,
      decl.loc ?? undefined,
      { placeholder: builtLater },
    );

    // If there's an initializer, store the value in memory (bytes in
    // calldata copy there)
    if (decl.initializer) {
      const value = yield* emitInMemory(
        yield* buildExpression(decl.initializer, { kind: "rvalue" }),
        decl.initializer,
      );

      // The value is already a reference to memory (a literal, an
      // array or a slice): the local refers to it
      if (value.kind === "temp") {
        yield* Process.Variables.updateSsaToExistingTemp(
          decl.name,
          value.id,
          irType,
        );
      } else {
        // For non-temp values, we need to copy it
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: value,
          right: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
          dest: allocTemp,
          operationDebug: yield* Process.Debug.forAstNode(decl),
        } as Ir.Instruction.BinaryOp);
      }
    }
  } else {
    // Original logic for non-memory types
    if (decl.initializer) {
      const value = yield* buildExpression(decl.initializer, {
        kind: "rvalue",
      });
      const ssaVar = yield* Process.Variables.declare(
        decl.name,
        irType,
        decl.loc ?? undefined,
      );

      // Generate assignment to the new SSA temp
      if (value.kind === "temp") {
        // If value is already a temp, just update SSA to use it
        if (value.id !== ssaVar.currentTempId) {
          yield* Process.Variables.updateSsaToExistingTemp(
            decl.name,
            value.id,
            irType,
          );
        }
      } else if (value.kind === "const") {
        // Create const instruction for constants
        yield* Process.Instructions.emit({
          kind: "const",
          value: value.value,
          type: irType,
          dest: ssaVar.currentTempId,
          operationDebug: yield* Process.Debug.forAstNode(decl),
        } as Ir.Instruction.Const);
      }
    } else {
      // No initializer - declare with default value
      const ssaVar = yield* Process.Variables.declare(
        decl.name,
        irType,
        decl.loc ?? undefined,
      );
      yield* Process.Instructions.emit({
        kind: "const",
        value: 0n,
        type: irType,
        dest: ssaVar.currentTempId,
        operationDebug: yield* Process.Debug.forAstNode(decl),
      } as Ir.Instruction.Const);
    }
  }
}
