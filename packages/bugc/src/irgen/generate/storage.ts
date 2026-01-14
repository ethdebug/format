import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Type } from "#types";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";
import { Process } from "./process.js";
import { buildExpression } from "./expressions/index.js";
import type { Context } from "./expressions/context.js";

/**
 * Local storage information for IR generation
 */
interface StorageInfo {
  slot: number;
  name: string;
  declaration: Ast.Declaration.Storage;
}

export interface StorageAccessChain {
  slot: StorageInfo;
  accesses: Array<{
    kind: "index" | "member";
    key?: Ir.Value;
    fieldName?: string;
    fieldOffset?: number;
    fieldType?: Ir.Type;
  }>;
}

/**
 * Try to extract a complete storage access chain from an expression.
 * Returns undefined if the expression isn't a pure storage access.
 */
export function* findStorageAccessChain(
  expr: Ast.Expression,
): Process<StorageAccessChain | undefined> {
  // Handle different expression types
  if (Ast.Expression.isIdentifier(expr)) {
    // Check if this is a storage variable
    const storageSlot = yield* Process.Storage.findSlot(expr.name);
    if (storageSlot) {
      return {
        slot: storageSlot,
        accesses: [],
      };
    }
    return undefined;
  }

  if (Ast.Expression.isAccess(expr) && Ast.Expression.Access.isIndex(expr)) {
    // array[index] or mapping[key]
    const indexExpr = expr as Ast.Expression.Access.Index;
    const baseChain = yield* findStorageAccessChain(indexExpr.object);
    if (!baseChain) return undefined;

    // Build the index value
    const key = yield* buildExpression(indexExpr.index, { kind: "rvalue" });

    baseChain.accesses.push({
      kind: "index",
      key,
    });
    return baseChain;
  }

  if (Ast.Expression.isAccess(expr) && Ast.Expression.Access.isMember(expr)) {
    // struct.field
    const memberExpr = expr as Ast.Expression.Access.Member;
    const baseChain = yield* findStorageAccessChain(memberExpr.object);
    if (!baseChain) return undefined;

    baseChain.accesses.push({
      kind: "member",
      fieldName: memberExpr.property,
    });
    return baseChain;
  }

  return undefined;
}

/**
 * Emit instructions to read from a storage location by following
 * an access chain (e.g., accounts[user].balance)
 */
export function* emitStorageChainAccess(
  expr: Ast.Expression,
  _context: Context,
): Process<Ir.Value | undefined> {
  const chain = yield* findStorageAccessChain(expr);
  if (!chain) return undefined;

  // Get the type of the expression from the type checker
  const exprType = yield* Process.Types.nodeType(expr);
  const irType = exprType ? fromBugType(exprType) : Ir.Type.Scalar.uint256;

  // Build the expression to load from storage
  const value = yield* emitStorageChainLoad(chain, irType, expr);

  return value;
}

/**
 * Determines field size in bytes based on type
 */
function getFieldSize(type: Ir.Type): number {
  // Check origin to get semantic type info
  if (type.origin !== "synthetic") {
    if (Type.Elementary.isAddress(type.origin)) {
      return 20; // addresses are 20 bytes
    } else if (Type.Elementary.isBool(type.origin)) {
      return 1; // bools are 1 byte
    } else if (Type.Elementary.isBytes(type.origin) && type.origin.size) {
      return type.origin.size; // fixed bytes
    } else if (Type.Elementary.isUint(type.origin)) {
      return (type.origin.bits || 256) / 8;
    }
  }

  // For scalars, use the size directly
  if (type.kind === "scalar") {
    return type.size;
  }

  // Default to full slot for references and unknown types
  return 32;
}

/**
 * Emit a storage chain load
 */
export function* emitStorageChainLoad(
  chain: StorageAccessChain,
  valueType: Ir.Type,
  node: Ast.Node | undefined,
): Process<Ir.Value> {
  // Get the Bug type from the type checker
  const bugType = yield* Process.Types.nodeType(chain.slot.declaration);

  let currentSlot = Ir.Value.constant(
    BigInt(chain.slot.slot),
    Ir.Type.Scalar.uint256,
  );

  // Track the Bug type for semantic information
  let currentOrigin = bugType;

  // Process each access in the chain
  for (const access of chain.accesses) {
    if (access.kind === "index" && access.key) {
      // For mapping/array access
      const tempId = yield* Process.Variables.newTemp();

      // Check the origin to determine if it's a mapping or array
      if (currentOrigin && Type.isMapping(currentOrigin)) {
        // Mapping access - get key and value types from Bug type
        const keyIrType = fromBugType(currentOrigin.key);
        yield* Process.Instructions.emit({
          kind: "compute_slot",
          slotKind: "mapping",
          base: currentSlot,
          key: access.key,
          keyType: keyIrType,
          dest: tempId,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        } as Ir.Instruction.ComputeSlot);
        // Update to the value type
        currentOrigin = currentOrigin.value;
      } else if (currentOrigin && Type.isArray(currentOrigin)) {
        // Array access - first compute the array's first slot (hash of base)
        const firstSlotTempId = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "compute_slot",
          slotKind: "array",
          base: currentSlot,
          dest: firstSlotTempId,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        } as Ir.Instruction.ComputeSlot);

        // Then add the index to get the actual element slot
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: Ir.Value.temp(firstSlotTempId, Ir.Type.Scalar.uint256),
          right: access.key,
          dest: tempId,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        } as Ir.Instruction.BinaryOp);
        // Update to the element type
        currentOrigin = currentOrigin.element;
      }

      currentSlot = Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
    } else if (access.kind === "member" && access.fieldName) {
      // For struct field access
      if (currentOrigin && Type.isStruct(currentOrigin)) {
        // Access struct information from the Bug type origin
        const fieldType = currentOrigin.fields.get(access.fieldName);
        const layout = currentOrigin.layout.get(access.fieldName);

        if (!fieldType || !layout) {
          throw new Error(
            `Field ${access.fieldName} not found in struct ${currentOrigin.name}`,
          );
        }

        // For structs in mappings, we need to generate compute_slot.field
        // to compute the field's slot offset
        const fieldSlotOffset = Math.floor(layout.byteOffset / 32);

        if (fieldSlotOffset > 0) {
          // Field is in a different slot, generate compute_slot.field
          const tempId = yield* Process.Variables.newTemp();
          yield* Process.Instructions.emit({
            kind: "compute_slot",
            slotKind: "field",
            base: currentSlot,
            fieldOffset: fieldSlotOffset,
            dest: tempId,
            operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
          });
          currentSlot = Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
        }

        // Store field info for later use in read/write
        access.fieldOffset = layout.byteOffset;
        // Store the field type so we know the correct size
        access.fieldType = fromBugType(fieldType);
        currentOrigin = fieldType;
      }
    }
  }

  // Check if the last access was a struct field to get packed field info
  let byteOffset = 0;
  let fieldSize = 32; // Default to full slot
  const lastAccess = chain.accesses[chain.accesses.length - 1];
  if (
    lastAccess &&
    lastAccess.kind === "member" &&
    lastAccess.fieldOffset !== undefined
  ) {
    // Calculate the byte offset within the slot
    byteOffset = lastAccess.fieldOffset % 32;

    // Determine field size from type
    if (lastAccess.fieldType) {
      fieldSize = getFieldSize(lastAccess.fieldType);
    }
  }

  // Generate the final read instruction using new unified format
  const loadTempId = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "read",
    location: "storage",
    slot: currentSlot,
    offset: Ir.Value.constant(BigInt(byteOffset), Ir.Type.Scalar.uint256),
    length: Ir.Value.constant(BigInt(fieldSize), Ir.Type.Scalar.uint256),
    type: valueType,
    dest: loadTempId,
    operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
  } as Ir.Instruction.Read);

  return Ir.Value.temp(loadTempId, valueType);
}

/**
 * Emit a storage write for an access chain
 */
export function* emitStorageChainStore(
  chain: StorageAccessChain,
  value: Ir.Value,
  node: Ast.Node | undefined,
): Process<void> {
  // Handle direct storage variable assignment (no accesses)
  if (chain.accesses.length === 0) {
    // Direct storage assignment using new unified format
    yield* Process.Instructions.emit({
      kind: "write",
      location: "storage",
      slot: Ir.Value.constant(BigInt(chain.slot.slot), Ir.Type.Scalar.uint256),
      offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
      length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
      value,
      operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
    } as Ir.Instruction.Write);
    return;
  }

  // Get the Bug type from the type checker
  const bugType = yield* Process.Types.nodeType(chain.slot.declaration);

  // Compute the final storage slot through the chain
  let currentSlot: Ir.Value = Ir.Value.constant(
    BigInt(chain.slot.slot),
    Ir.Type.Scalar.uint256,
  );
  let currentOrigin = bugType;

  // Process each access in the chain
  for (const access of chain.accesses) {
    if (access.kind === "index" && access.key) {
      // For mapping/array access
      if (currentOrigin && Type.isMapping(currentOrigin)) {
        // Mapping access
        const slotTemp = yield* Process.Variables.newTemp();
        const keyIrType = fromBugType(currentOrigin.key);
        yield* Process.Instructions.emit({
          kind: "compute_slot",
          slotKind: "mapping",
          base: currentSlot,
          key: access.key,
          keyType: keyIrType,
          dest: slotTemp,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        } as Ir.Instruction.ComputeSlot);
        currentSlot = Ir.Value.temp(slotTemp, Ir.Type.Scalar.uint256);
        currentOrigin = currentOrigin.value;
      } else if (currentOrigin && Type.isArray(currentOrigin)) {
        // Array access - first compute the array's first slot (hash of base)
        const firstSlotTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "compute_slot",
          slotKind: "array",
          base: currentSlot,
          dest: firstSlotTemp,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        });

        // Then add the index to get the actual element slot
        const slotTemp = yield* Process.Variables.newTemp();
        yield* Process.Instructions.emit({
          kind: "binary",
          op: "add",
          left: Ir.Value.temp(firstSlotTemp, Ir.Type.Scalar.uint256),
          right: access.key,
          dest: slotTemp,
          operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
        });
        currentSlot = Ir.Value.temp(slotTemp, Ir.Type.Scalar.uint256);
        currentOrigin = currentOrigin.element;
      }
    } else if (access.kind === "member" && access.fieldName) {
      // For struct field access
      if (currentOrigin && Type.isStruct(currentOrigin)) {
        const fieldType = currentOrigin.fields.get(access.fieldName);
        const layout = currentOrigin.layout.get(access.fieldName);

        if (fieldType && layout) {
          // Calculate the slot offset for the field
          const fieldSlotOffset = Math.floor(layout.byteOffset / 32);

          if (fieldSlotOffset > 0) {
            // Field is in a different slot
            const tempId = yield* Process.Variables.newTemp();
            yield* Process.Instructions.emit({
              kind: "compute_slot",
              slotKind: "field",
              base: currentSlot,
              fieldOffset: fieldSlotOffset,
              dest: tempId,
              operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
            });
            currentSlot = Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
          }

          // Store field info for later use in write
          access.fieldOffset = layout.byteOffset;
          // Store the field type so we know the correct size
          access.fieldType = fromBugType(fieldType);
          currentOrigin = fieldType;
        } else {
          yield* Process.Errors.report(
            new IrgenError(
              `Field ${access.fieldName} not found in struct`,
              node?.loc ?? undefined,
              Severity.Error,
            ),
          );
        }
      }
    }
  }

  // Check if the last access was a struct field to handle packed fields
  let byteOffset = 0;
  let fieldSize: number | undefined;
  const lastAccess = chain.accesses[chain.accesses.length - 1];
  if (
    lastAccess &&
    lastAccess.kind === "member" &&
    lastAccess.fieldOffset !== undefined
  ) {
    // Calculate the byte offset within the slot
    byteOffset = lastAccess.fieldOffset % 32;

    // Determine field size from type
    if (lastAccess.fieldType) {
      fieldSize = getFieldSize(lastAccess.fieldType);
    }
  }

  // Determine the actual field size to write
  const actualFieldSize = fieldSize !== undefined ? fieldSize : 32;

  // Store to the computed slot using new unified format
  yield* Process.Instructions.emit({
    kind: "write",
    location: "storage",
    slot: currentSlot,
    offset: Ir.Value.constant(BigInt(byteOffset), Ir.Type.Scalar.uint256),
    length: Ir.Value.constant(BigInt(actualFieldSize), Ir.Type.Scalar.uint256),
    value,
    operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
  } as Ir.Instruction.Write);
}

// The rest of the file contains commented-out old implementations
// which we can keep for reference...

// /**
//  * Generate storage access for a complete chain (e.g., accounts[user].balance)
//  */
// export function* generateStorageAccess(
//   chain: StorageAccessChain,
//   context: Context,
// ): Process<Ir.Value> {
//   const {
//     emit,
//     newTemp,
//     getNodeType,
//   } = yield* Process.all();
//
//   // Start with the base storage slot
//   let currentSlot = Ir.Value.constant(BigInt(chain.slot.slot), {
//     kind: "uint",
//     bits: 256,
//   });
//   let currentType = chain.slot.type;
//
//   // Process each access in the chain
//   for (const access of chain.accesses) {
//     if (access.kind === "index" && access.key) {
//       // For mapping/array access, compute the slot
//       const tempId = yield* newTemp();
//
//       yield* emit({
//         kind: "compute_slot",
//         baseSlot: currentSlot,
//         key: access.key,
//         dest: tempId,
//         loc,
//       } as Ir.Instruction);
//
//       currentSlot = Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
//
//       // Update type based on mapping/array element type
//       if (currentType.kind === "mapping") {
//         currentType = currentType.value || Ir.Type.Scalar.uint256;
//       } else if (currentType.kind === "array") {
//         currentType = currentType.element || Ir.Type.Scalar.uint256;
//       }
//     } else if (access.kind === "member" && access.fieldName) {
//       // For struct field access
//       if (currentType.kind === "struct") {
//         const fieldIndex =
//           currentType.fields.findIndex(
//             ({ name }) => name === access.fieldName,
//           ) ?? 0;
//         const tempId = yield* newTemp();
//
//         yield* emit({
//           kind: "compute_field_offset",
//           baseSlot: currentSlot,
//           fieldIndex,
//           dest: tempId,
//           loc,
//         } as Ir.Instruction);
//
//         currentSlot = Ir.Value.temp(tempId, Ir.Type.Scalar.uint256);
//         currentType = currentType.fields[fieldIndex]?.type || {
//           kind: "uint",
//           bits: 256,
//         };
//       }
//     }
//   }
//
//   // Load from the final slot
//   const loadTempId = yield* newTemp();
//   yield* emit({
//     kind: "load_storage",
//     slot: currentSlot,
//     dest: loadTempId,
//     loc,
//   } as Ir.Instruction);
//
//   return Ir.Value.temp(loadTempId, currentType);
// }

/**
 * Emit storage chain store for assignment
 */
// export function* generateStorageStore(
//   chain: StorageAccessChain,
//   value: Ir.Value,
//   loc: Ast.SourceLocation | undefined,
// ): Process<void> {
//   const { emit, newTemp } = yield* Process.all();
//
//   // Handle direct storage variable assignment (no accesses)
//   if (chain.accesses.length === 0) {
//     yield* emit({
//       kind: "store_storage",
//       slot: Ir.Value.constant(BigInt(chain.slot.slot), {
//         kind: "uint",
//         bits: 256,
//       }),
//       value,
//       loc,
//     } as Ir.Instruction);
//     return;
//   }
//
//   // Compute the final storage slot through the chain
//   let currentSlot: Ir.Value = Ir.Value.constant(BigInt(chain.slot.slot), {
//     kind: "uint",
//     bits: 256,
//   });
//   let currentType = chain.slot.type;
//
//   // Process each access in the chain
//   for (const access of chain.accesses) {
//     if (access.kind === "index" && access.key) {
//       // For mapping/array access
//       if (currentType.kind === "mapping") {
//         // Mapping access
//         const slotTemp = yield* newTemp();
//         yield* emit({
//           kind: "compute_slot",
//           baseSlot: currentSlot,
//           key: access.key,
//           dest: slotTemp,
//           loc,
//         } as Ir.Instruction);
//         currentSlot = Ir.Value.temp(slotTemp, Ir.Type.Scalar.uint256);
//         currentType = (currentType as { kind: "mapping"; value: Ir.Type })
//           .value;
//       } else if (currentType.kind === "array") {
//         // Array access
//         const baseSlotTemp = yield* newTemp();
//         yield* emit({
//           kind: "compute_array_slot",
//           baseSlot: currentSlot,
//           dest: baseSlotTemp,
//           loc,
//         } as Ir.Instruction);
//
//         // Add the index to get the final slot
//         const finalSlotTemp = yield* newTemp();
//         yield* emit({
//           kind: "binary",
//           op: "add",
//           left: Ir.Value.temp(baseSlotTemp, Ir.Type.Scalar.uint256),
//           right: access.key,
//           dest: finalSlotTemp,
//           loc,
//         } as Ir.Instruction);
//
//         currentSlot = Ir.Value.temp(finalSlotTemp, {
//           kind: "uint",
//           bits: 256,
//         });
//         currentType = (currentType as { kind: "array"; element: Ir.Type })
//           .element;
//       }
//     } else if (access.kind === "member" && access.fieldName) {
//       // For struct field access
//       if (currentType.kind === "struct") {
//         const fieldIndex =
//           currentType.fields.findIndex(
//             ({ name }) => name === access.fieldName,
//           ) ?? 0;
//         const slotTemp = yield* newTemp();
//
//         yield* emit({
//           kind: "compute_field_offset",
//           baseSlot: currentSlot,
//           fieldIndex,
//           dest: slotTemp,
//           loc,
//         } as Ir.Instruction);
//
//         currentSlot = Ir.Value.temp(slotTemp, {
//           kind: "uint",
//           bits: 256,
//         });
//         currentType = currentType.fields[fieldIndex]?.type || {
//           kind: "uint",
//           bits: 256,
//         };
//       }
//     }
//   }
//
//   // Store to the final slot
//   yield* emit({
//     kind: "store_storage",
//     slot: currentSlot,
//     value,
//     loc,
//   } as Ir.Instruction);
// }
