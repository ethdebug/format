import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Type } from "#types";

import { Error as IrgenError, assertExhausted } from "#irgen/errors";

import { Process } from "../process.js";
import type { Context } from "./context.js";
import { fromBugType } from "#irgen/type";
import {
  type StorageAccessChain,
  findStorageAccessChain,
  emitStorageChainLoad,
} from "../storage.js";
import {
  emitBoundsCheck,
  emitLength,
  emitMemoryElementOffset,
  emitMemoryByteOffset,
} from "../memory.js";

/**
 * Build an access expression (array/member access)
 */
export const makeBuildAccess = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) => {
  // findStorageAccessChain is now imported directly
  const buildIndexAccess = makeBuildIndexAccess(
    buildExpression,
    findStorageAccessChain,
  );
  const buildMemberAccess = makeBuildMemberAccess(
    buildExpression,
    findStorageAccessChain,
  );
  const buildSliceAccess = makeBuildSliceAccess(buildExpression);

  return function* buildAccess(
    expr: Ast.Expression.Access,
    context: Context,
  ): Process<Ir.Value> {
    switch (expr.kind) {
      case "expression:access:member":
        return yield* buildMemberAccess(
          expr as Ast.Expression.Access.Member,
          context,
        );

      case "expression:access:slice":
        return yield* buildSliceAccess(
          expr as Ast.Expression.Access.Slice,
          context,
        );

      case "expression:access:index":
        return yield* buildIndexAccess(
          expr as Ast.Expression.Access.Index,
          context,
        );

      default:
        assertExhausted(expr);
    }
  };
};

const makeBuildMemberAccess = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
  findStorageAccessChain: (
    node: Ast.Expression,
  ) => Process<StorageAccessChain | undefined>,
) =>
  function* buildMemberAccess(
    expr: Ast.Expression.Access.Member,
    _context: Context,
  ): Process<Ir.Value> {
    // Check if this is a .length property access
    if (expr.property === "length") {
      const objectType = yield* Process.Types.nodeType(expr.object);

      // Verify that the object type supports .length (arrays, bytes, string)
      if (
        objectType &&
        (Type.isArray(objectType) ||
          (Type.isElementary(objectType) &&
            (Type.Elementary.isBytes(objectType) ||
              Type.Elementary.isString(objectType))))
      ) {
        const resultType: Ir.Type = Ir.Type.Scalar.uint256;
        const tempId = yield* Process.Variables.newTemp();

        // For fixed-size arrays, emit a constant with the known size
        if (Type.isArray(objectType) && objectType.size !== undefined) {
          yield* Process.Instructions.emit({
            kind: "const",
            value: BigInt(objectType.size),
            type: resultType,
            dest: tempId,
            operationDebug: yield* Process.Debug.forAstNode(expr),
          } as Ir.Instruction);

          return Ir.Value.temp(tempId, resultType);
        }

        // For dynamic arrays/bytes/strings, emit length instruction
        const object = yield* buildExpression(expr.object, { kind: "rvalue" });
        yield* Process.Instructions.emit({
          kind: "length",
          object,
          dest: tempId,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction);

        return Ir.Value.temp(tempId, resultType);
      }
    }

    // First check if this is accessing a storage chain (e.g., accounts[user].balance)
    const chain = yield* findStorageAccessChain(expr);
    if (chain) {
      const nodeType = yield* Process.Types.nodeType(expr);
      if (nodeType) {
        const valueType = fromBugType(nodeType);
        return yield* emitStorageChainLoad(chain, valueType, expr);
      }
    }

    // Reading through local variables is allowed, no diagnostic needed

    // Otherwise, handle regular struct field access
    const object = yield* buildExpression(expr.object, { kind: "rvalue" });
    const objectType = yield* Process.Types.nodeType(expr.object);

    if (objectType && Type.isStruct(objectType)) {
      const fieldType = objectType.fields.get(expr.property);
      if (fieldType) {
        const fieldIndex = Array.from(objectType.fields.keys()).indexOf(
          expr.property,
        );
        const irFieldType = fromBugType(fieldType);

        // First compute the offset for the field
        const offsetTemp = yield* Process.Variables.newTemp();
        // Calculate field offset - assuming 32 bytes per field for now
        const fieldOffset = fieldIndex * 32;
        yield* Process.Instructions.emit(
          Ir.Instruction.ComputeOffset.field(
            "memory",
            object,
            expr.property,
            fieldOffset,
            offsetTemp,
            yield* Process.Debug.forAstNode(expr),
          ),
        );

        // Then read from that offset
        const tempId = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "read",
          location: "memory",
          offset: Ir.Value.temp(offsetTemp, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          type: irFieldType,
          dest: tempId,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Read);

        return Ir.Value.temp(tempId, irFieldType);
      }
    }

    throw new IrgenError(
      "Invalid member access expression",
      expr.loc ?? undefined,
      Severity.Error,
    );
  };

const makeBuildSliceAccess = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
) =>
  function* buildSliceAccess(
    expr: Ast.Expression.Access.Slice,
    _context: Context,
  ): Process<Ir.Value> {
    // Slice access - start:end
    const objectType = yield* Process.Types.nodeType(expr.object);
    if (
      objectType &&
      Type.isElementary(objectType) &&
      Type.Elementary.isBytes(objectType)
    ) {
      const object = yield* buildExpression(expr.object, { kind: "rvalue" });
      const start = yield* buildExpression(expr.start, { kind: "rvalue" });
      const end = yield* buildExpression(expr.end, { kind: "rvalue" });

      if (objectType.size !== undefined) {
        return yield* emitFixedBytesSlice(
          object,
          objectType.size,
          start,
          end,
          expr,
        );
      }

      // Revert unless start <= end <= length
      const objectLength = yield* emitLength(object, expr);
      yield* emitBoundsCheck("le", start, end, expr);
      yield* emitBoundsCheck("le", end, objectLength, expr);

      // Slicing bytes returns dynamic bytes (memory reference)
      const resultType: Ir.Type = Ir.Type.Ref.memory();

      // Calculate the length of the slice
      const lengthTemp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "binary",
        op: "sub",
        left: end,
        right: start,
        dest: lengthTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);
      const length = Ir.Value.temp(lengthTemp, Ir.Type.Scalar.uint256);

      // Allocate memory for the slice result (length + 32 for length prefix)
      const allocSizeTemp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "binary",
        op: "add",
        left: length,
        right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        dest: allocSizeTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);

      const destTemp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "allocate",
        location: "memory",
        size: Ir.Value.temp(allocSizeTemp, Ir.Type.Scalar.uint256),
        dest: destTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);

      // Store the length at the beginning of the allocated memory
      yield* Process.Instructions.emit({
        kind: "write",
        location: "memory",
        offset: Ir.Value.temp(destTemp, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        value: length,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Write);

      // Read the slice data from the source: `msg.data` is calldata
      // from offset 0; other bytes are in memory after a length word.
      // Either read copies one word.
      const dataTemp = yield* Process.Variables.newTemp();
      if (Ast.Expression.Special.isMsgData(expr.object)) {
        yield* Process.Instructions.emit({
          kind: "read",
          location: "calldata",
          offset: start,
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          type: resultType,
          dest: dataTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Read);
      } else {
        const sourceOffsetTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: object,
          right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          dest: sourceOffsetTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction);

        const adjustedSourceTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: Ir.Value.temp(sourceOffsetTemp, Ir.Type.Scalar.uint256),
          right: start,
          dest: adjustedSourceTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction);

        yield* Process.Instructions.emit({
          kind: "read",
          location: "memory",
          offset: Ir.Value.temp(adjustedSourceTemp, Ir.Type.Scalar.uint256),
          length,
          type: resultType,
          dest: dataTemp,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Read);
      }

      // Calculate destination offset (skip length prefix)
      const destDataOffsetTemp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "binary",
        op: "add",
        left: Ir.Value.temp(destTemp, Ir.Type.Scalar.uint256),
        right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        dest: destDataOffsetTemp,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction);

      // Write the slice data to destination
      yield* Process.Instructions.emit({
        kind: "write",
        location: "memory",
        offset: Ir.Value.temp(destDataOffsetTemp, Ir.Type.Scalar.uint256),
        length,
        value: Ir.Value.temp(dataTemp, resultType),
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Write);

      return Ir.Value.temp(destTemp, resultType);
    }

    throw new IrgenError(
      "Only bytes types can be sliced",
      expr.loc ?? undefined,
      Severity.Error,
    );
  };

/**
 * Slice a fixed-size `bytesN` value into new dynamic `bytes` in memory.
 *
 * A `bytesN` value is a word, not a memory address: its N bytes are the
 * word's low bytes. Shift byte `start` up to the word's first byte and
 * clear the bytes from `end - start` on, then store the length and that
 * one data word.
 */
function* emitFixedBytesSlice(
  object: Ir.Value,
  size: number,
  start: Ir.Value,
  end: Ir.Value,
  expr: Ast.Expression.Access.Slice,
): Process<Ir.Value> {
  const debug = yield* Process.Debug.forAstNode(expr);
  const uint256 = Ir.Type.Scalar.uint256;
  const constant = (value: bigint) => Ir.Value.constant(value, uint256);

  function* binary(
    op: Ir.Instruction.BinaryOp["op"],
    left: Ir.Value,
    right: Ir.Value,
  ): Process<Ir.Value> {
    const dest = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "binary",
      op,
      left,
      right,
      dest,
      operationDebug: debug,
    } as Ir.Instruction.BinaryOp);
    return Ir.Value.temp(dest, uint256);
  }

  // Revert unless start <= end <= N
  yield* emitBoundsCheck("le", start, end, expr);
  yield* emitBoundsCheck("le", end, constant(BigInt(size)), expr);

  const length = yield* binary("sub", end, start);

  // Move byte `start` of the N bytes to the word's first byte
  const leading = yield* binary(
    "add",
    yield* binary("mul", start, constant(8n)),
    constant(BigInt((32 - size) * 8)),
  );
  const aligned = yield* binary("shl", object, leading);

  // Clear the bytes past the slice's length
  const trailing = yield* binary(
    "mul",
    yield* binary("sub", constant(32n), length),
    constant(8n),
  );
  const data = yield* binary(
    "shl",
    yield* binary("shr", aligned, trailing),
    trailing,
  );

  // The length word and one data word
  const dest = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "allocate",
    location: "memory",
    size: constant(64n),
    dest,
    operationDebug: debug,
  } as Ir.Instruction);
  const address = Ir.Value.temp(dest, uint256);

  yield* Process.Instructions.emit({
    kind: "write",
    location: "memory",
    offset: address,
    length: constant(32n),
    value: length,
    operationDebug: debug,
  } as Ir.Instruction.Write);

  yield* Process.Instructions.emit({
    kind: "write",
    location: "memory",
    offset: yield* binary("add", address, constant(32n)),
    length: constant(32n),
    value: data,
    operationDebug: debug,
  } as Ir.Instruction.Write);

  return Ir.Value.temp(dest, Ir.Type.Ref.memory());
}

const makeBuildIndexAccess = (
  buildExpression: (
    node: Ast.Expression,
    context: Context,
  ) => Process<Ir.Value>,
  findStorageAccessChain: (
    node: Ast.Expression,
  ) => Process<StorageAccessChain | undefined>,
) =>
  function* buildIndexAccess(
    expr: Ast.Expression.Access.Index,
    _context: Context,
  ): Process<Ir.Value> {
    // Array/mapping/bytes index access
    // First check if we're indexing into bytes (not part of storage chain)
    const nodeType = yield* Process.Types.nodeType(expr);
    const objectType = yield* Process.Types.nodeType(expr.object);
    if (
      objectType &&
      Type.isElementary(objectType) &&
      Type.Elementary.isBytes(objectType)
    ) {
      // Fixed-size bytes types (bytes1, bytes4, etc.) cannot be indexed
      // They are atomic values, not arrays
      if (objectType.size !== undefined) {
        throw new IrgenError(
          `Cannot index into fixed-size bytes type 'bytes${objectType.size}'`,
          expr.loc ?? undefined,
          Severity.Error,
        );
      }

      // Dynamic bytes can be indexed
      const object = yield* buildExpression(expr.object, { kind: "rvalue" });
      const index = yield* buildExpression(expr.index, { kind: "rvalue" });
      // Bytes indexing returns uint8
      const elementType: Ir.Type = Ir.Type.scalar(1, "synthetic");

      const offset = yield* emitMemoryByteOffset(object, index, expr);

      // Read the byte at that offset
      const tempId = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "memory",
        offset,
        length: Ir.Value.constant(1n, Ir.Type.Scalar.uint256),
        type: elementType,
        dest: tempId,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Read);

      return Ir.Value.temp(tempId, elementType);
    }

    // Check if it's a memory array first (to avoid storage chain check for local arrays)
    if (objectType && Type.isArray(objectType)) {
      // Check if it's a local (memory) array
      if (Ast.Expression.isIdentifier(expr.object)) {
        const varName = expr.object.name;
        const localVar = yield* Process.Variables.lookup(varName);
        if (localVar) {
          // It's a local memory array - handle it directly
          const object = yield* buildExpression(expr.object, {
            kind: "rvalue",
          });
          const index = yield* buildExpression(expr.index, { kind: "rvalue" });
          const elementType = fromBugType(objectType.element);

          const offset = yield* emitMemoryElementOffset(object, index, expr);

          // Read the element at that offset
          const tempId = yield* Process.Variables.newTemp();
          yield* Process.Instructions.emit({
            kind: "read",
            location: "memory",
            offset,
            length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
            type: elementType,
            dest: tempId,
            operationDebug: yield* Process.Debug.forAstNode(expr),
          } as Ir.Instruction.Read);

          return Ir.Value.temp(tempId, elementType);
        }
      }
    }

    // For non-bytes, non-memory-array types, try to find a complete storage access chain
    const chain = yield* findStorageAccessChain(expr);
    if (chain && nodeType) {
      const valueType = fromBugType(nodeType);
      return yield* emitStorageChainLoad(chain, valueType, expr);
    }

    // If no storage chain, handle remaining cases
    const object = yield* buildExpression(expr.object, { kind: "rvalue" });
    const index = yield* buildExpression(expr.index, { kind: "rvalue" });

    if (objectType && Type.isArray(objectType)) {
      // This would be for complex array access (e.g., returned from function)
      const elementType = fromBugType(objectType.element);

      const offset = yield* emitMemoryElementOffset(object, index, expr);

      // Read the element at that offset
      const tempId = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "memory",
        offset,
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        type: elementType,
        dest: tempId,
        operationDebug: yield* Process.Debug.forAstNode(expr),
      } as Ir.Instruction.Read);

      return Ir.Value.temp(tempId, elementType);
    }

    if (
      objectType &&
      Type.isMapping(objectType) &&
      Ast.Expression.isIdentifier(expr.object)
    ) {
      // Simple mapping access - compute slot then read
      const storageVar = yield* Process.Storage.findSlot(expr.object.name);
      if (storageVar) {
        const valueType = fromBugType(objectType.value);

        // First compute the slot for the mapping key
        const slotTempId = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "compute_slot",
          slotKind: "mapping",
          base: Ir.Value.constant(
            BigInt(storageVar.slot),
            Ir.Type.Scalar.uint256,
          ),
          key: index,
          keyType: fromBugType(objectType.key),
          dest: slotTempId,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.ComputeSlot);

        // Then read from that computed slot
        const tempId = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "read",
          location: "storage",
          slot: Ir.Value.temp(slotTempId, Ir.Type.Scalar.uint256),
          offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
          length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
          type: valueType,
          dest: tempId,
          operationDebug: yield* Process.Debug.forAstNode(expr),
        } as Ir.Instruction.Read);

        return Ir.Value.temp(tempId, valueType);
      }
    }

    throw new IrgenError(
      "Invalid index access expression",
      expr.loc ?? undefined,
      Severity.Error,
    );
  };
