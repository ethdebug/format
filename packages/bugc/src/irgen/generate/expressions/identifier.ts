import type * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";

import { Error as IrgenError, ErrorMessages } from "#irgen/errors";
import { fromBugType } from "#irgen/type";

import { Process } from "../process.js";

/**
 * Build an identifier expression
 */
export function* buildIdentifier(
  expr: Ast.Expression.Identifier,
): Process<Ir.Value> {
  const ssaVar = yield* Process.Variables.lookup(expr.name);

  if (ssaVar) {
    // Check if we need a phi node for this variable
    const phiTemp = yield* Process.Variables.checkAndInsertPhi(
      expr.name,
      ssaVar,
    );
    if (phiTemp) {
      return Ir.Value.temp(phiTemp, ssaVar.type);
    }

    // Return the current SSA temp for this variable
    return Ir.Value.temp(ssaVar.currentTempId, ssaVar.type);
  }

  // Check if it's a storage variable
  const storageSlot = yield* Process.Storage.findSlot(expr.name);

  if (storageSlot) {
    // Get the type from the type checker
    const storageType = yield* Process.Types.nodeType(storageSlot.declaration);
    const irType = storageType
      ? fromBugType(storageType)
      : Ir.Type.Scalar.uint256;

    // Build storage load using new unified read instruction
    const tempId = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "read",
      location: "storage",
      slot: Ir.Value.constant(BigInt(storageSlot.slot), Ir.Type.Scalar.uint256),
      offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
      length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256), // 32 bytes for uint256
      type: irType,
      dest: tempId,
      operationDebug: yield* Process.Debug.forAstNode(expr),
    } as Ir.Instruction.Read);
    return Ir.Value.temp(tempId, irType);
  }

  // Unknown identifier - add error and return default value
  yield* Process.Errors.report(
    new IrgenError(
      ErrorMessages.UNKNOWN_IDENTIFIER(expr.name),
      expr.loc ?? undefined,
      Severity.Error,
    ),
  );

  return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
}
