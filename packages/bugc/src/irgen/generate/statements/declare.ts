import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { buildExpression } from "../expressions/index.js";
import { Process } from "../process.js";

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
  const needsMemoryAllocation = irType.kind === "ref";

  if (needsMemoryAllocation) {
    // For types that need memory allocation

    // For reference types, calculate size needed
    let sizeValue: Ir.Value;

    // Check if we have an initializer to determine size
    if (decl.initializer) {
      // For hex literals, calculate actual size needed
      if (
        Ast.Expression.isLiteral(decl.initializer) &&
        Ast.Expression.Literal.isHex(decl.initializer)
      ) {
        const hexLiteral = decl.initializer as Ast.Expression.Literal;
        const hexValue = hexLiteral.value.startsWith("0x")
          ? hexLiteral.value.slice(2)
          : hexLiteral.value;
        const byteSize = hexValue.length / 2;
        // Add 32 bytes for length prefix
        sizeValue = Ir.Value.constant(
          BigInt(byteSize + 32),
          Ir.Type.Scalar.uint256,
        );
      } else {
        // Default size for other initializers
        sizeValue = Ir.Value.constant(64n, Ir.Type.Scalar.uint256);
      }
    } else {
      // Default size when no initializer
      sizeValue = Ir.Value.constant(64n, Ir.Type.Scalar.uint256);
    }

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
    yield* Process.Variables.declareWithExistingTemp(
      decl.name,
      irType,
      allocTemp,
    );

    // If there's an initializer, store the value in memory
    if (decl.initializer) {
      const value = yield* buildExpression(decl.initializer, {
        kind: "rvalue",
      });

      // For reference types, we need to handle initialization
      // Check the initializer type to determine how to store it
      if (Ast.Expression.isLiteral(decl.initializer)) {
        const hexLiteral = decl.initializer as Ast.Expression.Literal;
        if (Ast.Expression.Literal.isHex(hexLiteral)) {
          const hexValue = hexLiteral.value.startsWith("0x")
            ? hexLiteral.value.slice(2)
            : hexLiteral.value;
          const byteSize = hexValue.length / 2;

          // Store length at the beginning
          yield* Process.Instructions.emit({
            kind: "write",
            location: "memory",
            offset: Ir.Value.temp(allocTemp, Ir.Type.Scalar.uint256),
            length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
            value: Ir.Value.constant(BigInt(byteSize), Ir.Type.Scalar.uint256),
            operationDebug: yield* Process.Debug.forAstNode(decl),
          } as Ir.Instruction.Write);

          // Store the actual bytes data after the length
          const dataOffsetTemp = yield* Process.Variables.newTemp();
          yield* Process.Instructions.emit({
            kind: "binary",
            op: "add",
            left: Ir.Value.temp(allocTemp, Ir.Type.Scalar.uint256),
            right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
            dest: dataOffsetTemp,
            operationDebug: yield* Process.Debug.forAstNode(decl),
          } as Ir.Instruction.BinaryOp);

          yield* Process.Instructions.emit({
            kind: "write",
            location: "memory",
            offset: Ir.Value.temp(dataOffsetTemp, Ir.Type.Scalar.uint256),
            length: Ir.Value.constant(BigInt(byteSize), Ir.Type.Scalar.uint256),
            value: value,
            operationDebug: yield* Process.Debug.forAstNode(decl),
          } as Ir.Instruction.Write);
        }
      } else {
        // For slice expressions and other bytes operations,
        // the value is already a reference to memory
        // We need to copy the slice result to the new allocation
        // This is a simplified version - a full implementation would need to
        // handle different cases more carefully

        // If the value is a temp, update the SSA variable to point to it
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
    }
  } else {
    // Original logic for non-memory types
    if (decl.initializer) {
      const value = yield* buildExpression(decl.initializer, {
        kind: "rvalue",
      });
      const ssaVar = yield* Process.Variables.declare(decl.name, irType);

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
      const ssaVar = yield* Process.Variables.declare(decl.name, irType);
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
