import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Process } from "./process.js";

/**
 * Compute the address of a memory array's element.
 *
 * An array in memory is the address of its length word; one word per
 * element follows the length.
 */
export function* emitMemoryElementOffset(
  array: Ir.Value,
  index: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const debug = yield* Process.Debug.forAstNode(node);

  const elementsBase = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op: "add",
    left: array,
    right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
    dest: elementsBase,
    operationDebug: debug,
  } as Ir.Instruction.BinaryOp);

  const offset = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit(
    Ir.Instruction.ComputeOffset.array(
      "memory",
      Ir.Value.temp(elementsBase, Ir.Type.Scalar.uint256),
      index,
      32,
      offset,
      debug,
    ),
  );

  return Ir.Value.temp(offset, Ir.Type.Scalar.uint256);
}

/**
 * Compute the address of a byte of `bytes` in memory.
 *
 * A `bytes` value in memory is the address of its length word; the
 * data follows the length.
 */
export function* emitMemoryByteOffset(
  bytes: Ir.Value,
  index: Ir.Value,
  node: Ast.Node,
): Process<Ir.Value> {
  const debug = yield* Process.Debug.forAstNode(node);

  const dataBase = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "binary",
    op: "add",
    left: bytes,
    right: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
    dest: dataBase,
    operationDebug: debug,
  } as Ir.Instruction.BinaryOp);

  const offset = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit(
    Ir.Instruction.ComputeOffset.byte(
      "memory",
      Ir.Value.temp(dataBase, Ir.Type.Scalar.uint256),
      index,
      offset,
      debug,
    ),
  );

  return Ir.Value.temp(offset, Ir.Type.Scalar.uint256);
}
