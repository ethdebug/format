import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Type } from "#types";
import { Process } from "../process.js";
import type { Context } from "./context.js";
import { buildExpression } from "./expression.js";

/**
 * Build IR for an array expression.
 * The behavior depends on the evaluation context:
 * - rvalue: allocate memory and initialize
 * - lvalue-storage: handled specially in assignment
 * - lvalue-memory: allocate and initialize in memory
 */
export function* buildArray(
  expr: Ast.Expression.Array,
  context: Context,
): Process<Ir.Value> {
  switch (context.kind) {
    case "lvalue-storage": {
      // Storage array assignment - expand to individual storage writes
      // First, store the array length at the base slot
      const lengthValue = Ir.Value.constant(
        BigInt(expr.elements.length),
        Ir.Type.Scalar.uint256,
      );
      yield* Process.Instructions.emit({
        kind: "write",
        location: "storage",
        slot: Ir.Value.constant(BigInt(context.slot), Ir.Type.Scalar.uint256),
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        value: lengthValue,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Write);

      // Then write each element
      for (let i = 0; i < expr.elements.length; i++) {
        // Generate the value for this element
        const elementValue = yield* buildExpression(expr.elements[i], {
          kind: "rvalue",
        });

        // Generate the index value
        const indexValue = Ir.Value.constant(BigInt(i), Ir.Type.Scalar.uint256);

        // Compute the first slot for the array
        const firstSlotTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit(
          Ir.Instruction.ComputeSlot.array(
            Ir.Value.constant(BigInt(context.slot), Ir.Type.Scalar.uint256),
            firstSlotTemp,
            yield* Process.Debug.forAstNode(expr),
          ),
        );

        // Add the index to get the actual element slot
        const slotTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: Ir.Value.temp(firstSlotTemp, Ir.Type.Scalar.uint256),
          right: indexValue,
          dest: slotTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.BinaryOp);

        // Write to storage
        yield* Process.Instructions.emit({
          kind: "write",
          location: "storage",
          slot: Ir.Value.temp(slotTemp, Ir.Type.Scalar.uint256),
          offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          value: elementValue,
          operationDebug: yield* Process.Debug.forAstNode(expr.elements[i]),
        } as Ir.Instruction.Write);
      }

      // Return a marker value since storage arrays don't have a memory address
      return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
    }

    case "lvalue-memory":
    case "rvalue": {
      // For memory contexts (both lvalue and rvalue), allocate and initialize
      const arrayType =
        context.kind === "lvalue-memory"
          ? context.type
          : yield* Process.Types.nodeType(expr);

      if (!arrayType || !Type.isArray(arrayType)) {
        // Fallback if type inference fails
        const elementCount = BigInt(expr.elements.length);
        const totalSize = 32n + elementCount * 32n;

        const basePtr = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "allocate",
          location: "memory",
          size: Ir.Value.constant(totalSize, Ir.Type.Scalar.uint256),
          dest: basePtr,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Allocate);

        // Store length
        yield* Process.Instructions.emit({
          kind: "write",
          location: "memory",
          offset: Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          value: Ir.Value.constant(elementCount, Ir.Type.Scalar.uint256),
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Write);

        // Calculate elements base (skip length field)
        const elementsBaseTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256),
          right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          dest: elementsBaseTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction);

        // Store each element
        for (let i = 0; i < expr.elements.length; i++) {
          const elementValue = yield* buildExpression(expr.elements[i], {
            kind: "rvalue",
          });

          const offsetTemp = yield* Process.Variables.newTemp();
          yield* Process.Instructions.emit(
            Ir.Instruction.ComputeOffset.array(
              "memory",
              Ir.Value.temp(elementsBaseTemp, Ir.Type.Scalar.uint256),
              Ir.Value.constant(BigInt(i), Ir.Type.Scalar.uint256),
              32,
              offsetTemp,
              yield* Process.Debug.forAstNode(expr.elements[i]),
            ),
          );

          yield* Process.Instructions.emit({
            kind: "write",
            location: "memory",
            offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
            length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
            value: elementValue,
            operationDebug: yield* Process.Debug.forAstNode(expr.elements[i]),
          } as Ir.Instruction.Write);
        }

        return Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256);
      }

      // Same implementation as above but with proper type
      const elementCount = BigInt(expr.elements.length);
      const totalSize = 32n + elementCount * 32n;

      const basePtr = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "allocate",
        location: "memory",
        size: Ir.Value.constant(totalSize, Ir.Type.Scalar.uint256),
        dest: basePtr,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Allocate);

      // Store length
      yield* Process.Instructions.emit({
        kind: "write",
        location: "memory",
        offset: Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        value: Ir.Value.constant(elementCount, Ir.Type.Scalar.uint256),
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Write);

      // Calculate elements base
      const elementsBaseTemp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "binary",
        op: "add",
        left: Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256),
        right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        dest: elementsBaseTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);

      // Store each element
      for (let i = 0; i < expr.elements.length; i++) {
        const elementValue = yield* buildExpression(expr.elements[i], {
          kind: "rvalue",
        });

        const offsetTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit(
          Ir.Instruction.ComputeOffset.array(
            "memory",
            Ir.Value.temp(elementsBaseTemp, Ir.Type.Scalar.uint256),
            Ir.Value.constant(BigInt(i), Ir.Type.Scalar.uint256),
            32,
            offsetTemp,
            yield* Process.Debug.forAstNode(expr.elements[i]),
          ),
        );

        yield* Process.Instructions.emit({
          kind: "write",
          location: "memory",
          offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          value: elementValue,
          operationDebug: yield* Process.Debug.forAstNode(expr.elements[i]),
        } as Ir.Instruction.Write);
      }

      return Ir.Value.temp(basePtr, Ir.Type.Scalar.uint256);
    }
  }
}
