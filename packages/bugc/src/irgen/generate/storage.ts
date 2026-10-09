import * as Ast from "#ast";
import * as Ir from "#ir";
import { Severity } from "#result";
import { Storage, Type } from "#types";

import { Error as IrgenError } from "#irgen/errors";
import { fromBugType } from "#irgen/type";
import { Process } from "./process.js";
import { emitBoundsCheck } from "./memory.js";
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
    /** An index that is not checked against the length (a push's) */
    unchecked?: boolean;
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
 * Emit a write of a whole storage variable. A variable narrower than a
 * slot writes only its own bytes, at the low-order end of the slot.
 */
export function* emitStorageVariableStore(
  slot: { slot: number; declaration: Ast.Declaration.Storage },
  value: Ir.Value,
  node: Ast.Node | undefined,
): Process<void> {
  const type = yield* Process.Types.nodeType(slot.declaration);
  const base = Ir.Value.constant(BigInt(slot.slot), Ir.Type.Scalar.uint256);
  if (type && (yield* emitStorageCopyFromMemory(base, type, value, node)))
    return;
  const size = type ? getFieldSize(fromBugType(type)) : 32;

  yield* Process.Instructions.emit({
    kind: "write",
    location: "storage",
    slot: Ir.Value.constant(BigInt(slot.slot), Ir.Type.Scalar.uint256),
    offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
    length: Ir.Value.constant(BigInt(size), Ir.Type.Scalar.uint256),
    value,
    operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
  } as Ir.Instruction.Write);
}

/**
 * Emit the slot of element `index` of the storage array at `slot` (see
 * `Storage`), and, for an element that shares its slot, its byte offset
 * from the slot's low-order end. An index at or past the array's length
 * reverts, unless it is not `checked` (as a push's, which is the length).
 */
export function* emitArrayElement(
  array: Type.Array,
  slot: Ir.Value,
  index: Ir.Value,
  node: Ast.Node | undefined,
  checked: boolean = true,
): Process<{ slot: Ir.Value; offset?: Ir.Value }> {
  const debug = node ? yield* Process.Debug.forAstNode(node) : {};

  if (checked) {
    // A dynamic array's length is the word in its slot
    let length = Ir.Value.constant(
      BigInt(array.size ?? 0),
      Ir.Type.Scalar.uint256,
    );
    if (array.size === undefined) {
      const dest = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "storage",
        slot,
        offset: Ir.Value.constant(0n, Ir.Type.Scalar.uint256),
        length: Ir.Value.constant(32n, Ir.Type.Scalar.uint256),
        type: Ir.Type.Scalar.uint256,
        dest,
        operationDebug: debug,
      } as Ir.Instruction.Read);
      length = Ir.Value.temp(dest, Ir.Type.Scalar.uint256);
    }
    yield* emitBoundsCheck("lt", index, length, node);
  }
  const binary = function* (
    op: "add" | "mul" | "div" | "mod",
    left: Ir.Value,
    right: Ir.Value | number,
  ): Process<Ir.Value> {
    const dest = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "binary",
      op,
      left,
      right:
        typeof right === "number"
          ? Ir.Value.constant(BigInt(right), Ir.Type.Scalar.uint256)
          : right,
      dest,
      operationDebug: debug,
    } as Ir.Instruction.BinaryOp);
    return Ir.Value.temp(dest, Ir.Type.Scalar.uint256);
  };

  // A fixed-size array's elements start at its slot; a dynamic array's
  // at keccak256 of its slot
  let first = slot;
  if (array.size === undefined) {
    const dest = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "compute_slot",
      slotKind: "array",
      base: slot,
      dest,
      operationDebug: debug,
    } as Ir.Instruction.ComputeSlot);
    first = Ir.Value.temp(dest, Ir.Type.Scalar.uint256);
  }

  const perSlot = Storage.elementsPerSlot(array.element);
  if (perSlot > 1) {
    const position = yield* binary("mod", index, perSlot);
    return {
      slot: yield* binary("add", first, yield* binary("div", index, perSlot)),
      offset: yield* binary("mul", position, Storage.size(array.element)!),
    };
  }

  const stride = Storage.slots(array.element);
  return {
    slot: yield* binary(
      "add",
      first,
      stride === 1 ? index : yield* binary("mul", index, stride),
    ),
  };
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
  // An array element's byte offset in its slot, if it shares the slot
  let elementOffset: Ir.Value | undefined;

  // Process each access in the chain
  for (const access of chain.accesses) {
    elementOffset = undefined;
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
        const element = yield* emitArrayElement(
          currentOrigin,
          currentSlot,
          access.key,
          node,
          !access.unchecked,
        );
        elementOffset = element.offset;
        currentSlot = element.slot;
        currentOrigin = currentOrigin.element;
        continue;
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
            fieldOffset: layout.byteOffset,
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

  // A struct is a copy in memory, not the slot's word; an array cannot
  // be copied (its length is a word, though)
  if (
    currentOrigin &&
    (Type.isStruct(currentOrigin) ||
      (Type.isArray(currentOrigin) && valueType.kind === "ref"))
  ) {
    return yield* emitStorageCopyToMemory(currentSlot, currentOrigin, node);
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

  if (elementOffset && currentOrigin) {
    fieldSize = Storage.size(currentOrigin) ?? 32;
  }

  // Generate the final read instruction using new unified format
  const loadTempId = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "read",
    location: "storage",
    slot: currentSlot,
    offset:
      elementOffset ??
      Ir.Value.constant(BigInt(byteOffset), Ir.Type.Scalar.uint256),
    length: Ir.Value.constant(BigInt(fieldSize), Ir.Type.Scalar.uint256),
    type: valueType,
    dest: loadTempId,
    operationDebug: node ? yield* Process.Debug.forAstNode(node) : {},
  } as Ir.Instruction.Read);

  return Ir.Value.temp(loadTempId, valueType);
}

/**
 * Whether a type is a string or dynamic `bytes`: in storage, encoded
 * as Solidity encodes them; in memory, a length word, then the data
 */
function isDynamicBytes(type: Type): boolean {
  return (
    Type.isElementary(type) &&
    (Type.Elementary.isString(type) ||
      (Type.Elementary.isBytes(type) && type.size === undefined))
  );
}

/**
 * Report a value that bugc cannot copy to or from storage: an array, or
 * a struct with an array or mapping field (`within`)
 */
function* reportUncopyable(
  type: Type,
  node: Ast.Node | undefined,
  within?: { struct: Type.Struct; field: string },
): Process<void> {
  const message = within
    ? `bugc cannot copy struct ${within.struct.name} to or from ` +
      `storage: field ${within.field} is ${Type.format(type)}, and bugc ` +
      `can copy only value, string, bytes, and struct fields`
    : `bugc cannot copy ${Type.format(type)} to or from storage`;
  yield* Process.Errors.report(
    new IrgenError(message, node?.loc ?? undefined, Severity.Error),
  );
}

/**
 * Copy a struct or array from storage at `slot` to memory: a struct is
 * copied field by field (its address in memory is the value); an array
 * cannot be copied, which is an error.
 */
export function* emitStorageCopyToMemory(
  slot: Ir.Value,
  type: Type.Struct | Type.Array,
  node: Ast.Node | undefined,
): Process<Ir.Value> {
  if (Type.isStruct(type)) {
    return yield* emitStorageStructCopy(slot, type, node);
  }
  yield* reportUncopyable(type, node);
  return Ir.Value.constant(0n, Ir.Type.Scalar.uint256);
}

/**
 * The slot of a struct's field, for a struct at `slot`
 */
function* emitFieldSlot(
  slot: Ir.Value,
  byteOffset: number,
  debug: Ir.Instruction.Debug,
): Process<Ir.Value> {
  if (byteOffset < 32) return slot;
  const temp = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "compute_slot",
    slotKind: "field",
    base: slot,
    fieldOffset: byteOffset,
    dest: temp,
    operationDebug: debug,
  } as Ir.Instruction.ComputeSlot);
  return Ir.Value.temp(temp, Ir.Type.Scalar.uint256);
}

/**
 * The address of the word of a struct's `index`th field, for a struct
 * in memory at `address`
 */
function* emitFieldWord(
  address: Ir.Value,
  name: string,
  index: number,
  debug: Ir.Instruction.Debug,
): Process<Ir.Value> {
  if (index === 0) return address;
  const temp = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit(
    Ir.Instruction.ComputeOffset.field(
      "memory",
      address,
      name,
      index * 32,
      temp,
      debug,
    ),
  );
  return Ir.Value.temp(temp, Ir.Type.Scalar.uint256);
}

/**
 * Copy a struct from storage, starting at `slot`, into new memory, and
 * return its address. A struct in memory has one word per field, in
 * order: a value type's value, or the address of a struct, string, or
 * `bytes` field's own copy.
 */
function* emitStorageStructCopy(
  slot: Ir.Value,
  struct: Type.Struct,
  node: Ast.Node | undefined,
): Process<Ir.Value> {
  const debug = node ? yield* Process.Debug.forAstNode(node) : {};
  const uint256 = Ir.Type.Scalar.uint256;
  const constant = (value: bigint) => Ir.Value.constant(value, uint256);

  const address = yield* Process.Variables.newTemp();
  yield* Process.Instructions.emit({
    kind: "allocate",
    location: "memory",
    size: constant(BigInt(struct.fields.size * 32)),
    dest: address,
    operationDebug: debug,
  } as Ir.Instruction);

  let index = 0;
  for (const [name, fieldType] of struct.fields) {
    const layout = struct.layout.get(name);
    if (!layout) {
      throw new Error(`Field ${name} not found in struct ${struct.name}`);
    }
    const fieldSlot = yield* emitFieldSlot(slot, layout.byteOffset, debug);

    let value: Ir.Value;
    if (Type.isStruct(fieldType)) {
      value = yield* emitStorageStructCopy(fieldSlot, fieldType, node);
    } else if (Type.isElementary(fieldType)) {
      // A string or `bytes` reads as a copy in memory; a value type,
      // from its bytes in the slot
      const irType = fromBugType(fieldType);
      const length = isDynamicBytes(fieldType) ? 32 : getFieldSize(irType);
      const temp = yield* Process.Variables.newTemp();
      yield* Process.Instructions.emit({
        kind: "read",
        location: "storage",
        slot: fieldSlot,
        offset: constant(BigInt(layout.byteOffset % 32)),
        length: constant(BigInt(length)),
        type: irType,
        dest: temp,
        operationDebug: debug,
      } as Ir.Instruction.Read);
      value = Ir.Value.temp(temp, irType);
    } else {
      yield* reportUncopyable(fieldType, node, {
        struct,
        field: name,
      });
      value = constant(0n);
    }

    yield* Process.Instructions.emit({
      kind: "write",
      location: "memory",
      offset: yield* emitFieldWord(
        Ir.Value.temp(address, uint256),
        name,
        index,
        debug,
      ),
      length: constant(32n),
      value,
      operationDebug: debug,
    } as Ir.Instruction.Write);

    index++;
  }

  return Ir.Value.temp(address, Ir.Type.ref("memory", struct));
}

/**
 * Copy a struct from memory, at `address`, to storage, starting at
 * `slot`: each field to its bytes in its slot, as the struct's layout
 * places it. A struct, string, or `bytes` field's word holds the
 * address of its data, which is copied in turn (a string or `bytes`
 * as Solidity encodes it).
 */
function* emitStorageStructStore(
  slot: Ir.Value,
  struct: Type.Struct,
  address: Ir.Value,
  node: Ast.Node | undefined,
): Process<void> {
  const debug = node ? yield* Process.Debug.forAstNode(node) : {};
  const uint256 = Ir.Type.Scalar.uint256;
  const constant = (value: bigint) => Ir.Value.constant(value, uint256);

  let index = 0;
  for (const [name, fieldType] of struct.fields) {
    const layout = struct.layout.get(name);
    if (!layout) {
      throw new Error(`Field ${name} not found in struct ${struct.name}`);
    }

    if (!Type.isStruct(fieldType) && !Type.isElementary(fieldType)) {
      yield* reportUncopyable(fieldType, node, {
        struct,
        field: name,
      });
      index++;
      continue;
    }

    // The field's word in memory
    const irType = fromBugType(fieldType);
    const word = yield* emitFieldWord(address, name, index, debug);
    const temp = yield* Process.Variables.newTemp();
    yield* Process.Instructions.emit({
      kind: "read",
      location: "memory",
      offset: word,
      length: constant(32n),
      type: irType,
      dest: temp,
      operationDebug: debug,
    } as Ir.Instruction.Read);
    const value = Ir.Value.temp(temp, irType);

    const fieldSlot = yield* emitFieldSlot(slot, layout.byteOffset, debug);
    if (Type.isStruct(fieldType)) {
      yield* emitStorageStructStore(fieldSlot, fieldType, value, node);
    } else {
      yield* Process.Instructions.emit({
        kind: "write",
        location: "storage",
        slot: fieldSlot,
        offset: constant(BigInt(layout.byteOffset % 32)),
        length: constant(
          BigInt(isDynamicBytes(fieldType) ? 32 : getFieldSize(irType)),
        ),
        value,
        operationDebug: debug,
      } as Ir.Instruction.Write);
    }

    index++;
  }
}

/**
 * Copy a value in memory to storage at `slot`, if `type` is one stored
 * by copying its data: a struct is copied field by field;
 * an array cannot be copied, which is an error. Returns whether the
 * value was handled here (a string or `bytes` is not: a write of one
 * copies it).
 */
function* emitStorageCopyFromMemory(
  slot: Ir.Value,
  type: Type,
  value: Ir.Value,
  node: Ast.Node | undefined,
): Process<boolean> {
  if (value.type.kind !== "ref") return false;
  if (Type.isStruct(type)) {
    yield* emitStorageStructStore(slot, type, value, node);
    return true;
  }
  if (Type.isArray(type)) {
    yield* reportUncopyable(type, node);
    return true;
  }
  return false;
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
    yield* emitStorageVariableStore(chain.slot, value, node);
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
  // An array element's byte offset in its slot, if it shares the slot
  let elementOffset: Ir.Value | undefined;

  // Process each access in the chain
  for (const access of chain.accesses) {
    elementOffset = undefined;
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
        const element = yield* emitArrayElement(
          currentOrigin,
          currentSlot,
          access.key,
          node,
          !access.unchecked,
        );
        elementOffset = element.offset;
        currentSlot = element.slot;
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
              fieldOffset: layout.byteOffset,
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

  if (
    currentOrigin &&
    (yield* emitStorageCopyFromMemory(currentSlot, currentOrigin, value, node))
  ) {
    return;
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
  } else if (currentOrigin && Type.isElementary(currentOrigin)) {
    // A mapping value or array element narrower than a slot writes
    // only its own bytes, at the low-order end of its slot
    fieldSize = getFieldSize(fromBugType(currentOrigin));
  }

  // Determine the actual field size to write
  const actualFieldSize = fieldSize !== undefined ? fieldSize : 32;

  // Store to the computed slot using new unified format
  yield* Process.Instructions.emit({
    kind: "write",
    location: "storage",
    slot: currentSlot,
    offset:
      elementOffset ??
      Ir.Value.constant(BigInt(byteOffset), Ir.Type.Scalar.uint256),
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
