import * as Ast from "#ast";
import * as Ir from "#ir";
import { Type } from "#types";
import { Error as IrgenError } from "#irgen/errors";
import { Severity } from "#result";
import { buildExpression } from "../expressions/index.js";
import { Process } from "../process.js";
import type { Context } from "../expressions/context.js";

import { findStorageAccessChain, emitStorageChainStore } from "../storage.js";

/**
 * Build an assignment statement
 */
export function* buildAssignmentStatement(
  stmt: Ast.Statement.Assign,
): Process<void> {
  yield* buildLValue(stmt.target, stmt.value);
}

/**
 * Handle lvalue assignment
 * @param target The target expression to assign to
 * @param valueExpr The value expression being assigned
 */
function* buildLValue(
  target: Ast.Expression,
  valueExpr: Ast.Expression,
): Process<void> {
  // Determine the evaluation context based on the target
  let context: Context = { kind: "rvalue" };

  if (target.kind === "expression:identifier") {
    const targetName = (target as Ast.Expression.Identifier).name;

    // Check if it's storage
    const storageSlot = yield* Process.Storage.findSlot(targetName);
    if (storageSlot) {
      const targetType = yield* Process.Types.nodeType(target);
      if (targetType) {
        context = {
          kind: "lvalue-storage",
          slot: storageSlot.slot,
          type: targetType,
        };
      }
    } else {
      // Check if it's a local variable
      const variable = yield* Process.Variables.lookup(targetName);
      if (variable) {
        const targetType = yield* Process.Types.nodeType(target);
        if (targetType) {
          context = { kind: "lvalue-memory", type: targetType };
        }
      }
    }
  }

  // Evaluate the value expression with the appropriate context
  const value = yield* buildExpression(valueExpr, context);

  // For storage array assignments, the array expression will have already
  // expanded to storage writes, so we don't need to do anything else
  if (
    context.kind === "lvalue-storage" &&
    valueExpr.kind === "expression:array"
  ) {
    return;
  }

  // Otherwise assign the computed value to the target
  yield* assignToTarget(target, value);
}

/**
 * Assign a value to a target expression (identifier or access expression)
 */
function* assignToTarget(node: Ast.Expression, value: Ir.Value): Process<void> {
  if (node.kind === "expression:identifier") {
    const name = (node as Ast.Expression.Identifier).name;

    // Check if it's a variable
    const ssaVar = yield* Process.Variables.lookup(name);
    if (ssaVar) {
      // Instead of creating a new SSA version with a new temp,
      // we can just update the SSA variable to point to the value's temp
      if (value.kind === "temp") {
        // If the value is already a temp, we can just update the SSA variable
        // to point to it directly
        yield* Process.Variables.updateSsaToExistingTemp(
          name,
          value.id,
          ssaVar.type,
        );
      } else {
        // For non-temp values (constants, etc.), we still need to create a new temp
        const newSsaVar = yield* Process.Variables.assignSsa(name, ssaVar.type);

        // Copy the non-temp value to the new SSA temp
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: value,
          right: Ir.Value.constant(0n, ssaVar.type),
          dest: newSsaVar.currentTempId,
          operationDebug: yield* Process.Debug.forAstNode(node),
        } as Ir.Instruction);
      }
      return;
    }

    // Check if it's storage
    const storageSlot = yield* Process.Storage.findSlot(name);
    if (storageSlot) {
      yield* Process.Instructions.emit({
        kind: "write",
        location: "storage",
        slot: Ir.Value.constant(
          BigInt(storageSlot.slot),
          Ir.Type.Scalar.uint256,
        ),
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256), // 32 bytes for uint256
        value,
        operationDebug: yield* Process.Debug.forAstNode(node),
      } as Ir.Instruction.Write);
      return;
    }

    yield* Process.Errors.report(
      new IrgenError(
        `Unknown identifier: ${name}`,
        node.loc || undefined,
        Severity.Error,
      ),
    );
    return;
  }

  if (
    node.kind === "expression:access:member" ||
    node.kind === "expression:access:slice" ||
    node.kind === "expression:access:index"
  ) {
    const accessNode = node as Ast.Expression.Access;

    if (accessNode.kind === "expression:access:member") {
      // First check if this is a storage chain assignment
      const chain = yield* findStorageAccessChain(node);
      if (chain) {
        yield* emitStorageChainStore(chain, value, accessNode);
        return;
      }

      // Otherwise, handle regular struct field assignment
      const object = yield* buildExpression(
        (accessNode as Ast.Expression.Access.Member).object,
        {
          kind: "rvalue",
        },
      );
      const objectType = yield* Process.Types.nodeType(
        (accessNode as Ast.Expression.Access.Member).object,
      );

      if (objectType && Type.isStruct(objectType)) {
        const fieldName = (accessNode as Ast.Expression.Access.Member)
          .property as string;
        const fieldType = objectType.fields.get(fieldName);
        if (fieldType) {
          // Find field index
          let fieldIndex = 0;
          for (const [name] of objectType.fields) {
            if (name === fieldName) break;
            fieldIndex++;
          }

          // First compute the offset for the field
          const offsetTemp = yield* Process.Variables.newTemp();
          // Calculate field offset - assuming 32 bytes per field for now
          const fieldOffset = fieldIndex * 32;
          yield* Process.Instructions.emit({
            kind: "compute_offset",
            location: "memory",
            base: object,
            field: fieldName,
            fieldOffset,
            dest: offsetTemp,
            operationDebug: yield* Process.Debug.forAstNode(accessNode),
          } as Ir.Instruction.ComputeOffset);

          // Then write to that offset
          yield* Process.Instructions.emit({
            kind: "write",
            location: "memory",
            offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
            length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
            value,
            operationDebug: yield* Process.Debug.forAstNode(accessNode),
          } as Ir.Instruction.Write);
          return;
        }
      }
    } else if (accessNode.kind === "expression:access:index") {
      // Array/mapping/bytes assignment
      // First check if we're assigning to bytes
      const objectType = yield* Process.Types.nodeType(accessNode.object);
      if (
        objectType &&
        Type.isElementary(objectType) &&
        Type.Elementary.isBytes(objectType)
      ) {
        // Handle bytes indexing directly
        const object = yield* buildExpression(accessNode.object, {
          kind: "rvalue",
        });
        const index = yield* buildExpression(accessNode.index, {
          kind: "rvalue",
        });

        // Compute offset for the byte at the index
        const offsetTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "compute_offset",
          location: "memory",
          base: object,
          index,
          stride: 1, // bytes are 1 byte each
          dest: offsetTemp,
          operationDebug: yield* Process.Debug.forAstNode(node),
        } as Ir.Instruction.ComputeOffset);

        // Write the byte at that offset
        yield* Process.Instructions.emit({
          kind: "write",
          location: "memory",
          offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(1n, Ir.Type.Scalar.uint256),
          value,
          operationDebug: yield* Process.Debug.forAstNode(node),
        } as Ir.Instruction.Write);
        return;
      }

      // For non-bytes types, try to find a complete storage access chain
      const chain = yield* findStorageAccessChain(node);
      if (chain) {
        yield* emitStorageChainStore(chain, value, accessNode);
        return;
      }

      // If no storage chain, handle regular array/mapping access
      const object = yield* buildExpression(accessNode.object, {
        kind: "rvalue",
      });
      const index = yield* buildExpression(accessNode.index, {
        kind: "rvalue",
      });

      if (objectType && Type.isArray(objectType)) {
        // Compute offset for array element
        const offsetTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "compute_offset",
          location: "memory",
          base: object,
          index,
          stride: 32, // array elements are 32 bytes each
          dest: offsetTemp,
          operationDebug: yield* Process.Debug.forAstNode(node),
        } as Ir.Instruction.ComputeOffset);

        // Write the element at that offset
        yield* Process.Instructions.emit({
          kind: "write",
          location: "memory",
          offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          value,
          operationDebug: yield* Process.Debug.forAstNode(node),
        } as Ir.Instruction.Write);
        return;
      }
    }
  }

  yield* Process.Errors.report(
    new IrgenError("Invalid lvalue", node.loc || undefined, Severity.Error),
  );
}
