/**
 * Variable collection utilities for ethdebug/format integration
 *
 * Collects variable information for generating variables contexts
 */

import * as Format from "@ethdebug/format";
import type { State } from "../generate/state.js";
import { generatePointer, type VariableLocation } from "./pointers.js";
import { Storage, Type } from "#types";
import { convertBugType } from "./types.js";

/**
 * Information about a variable available for debug contexts
 */
export interface VariableInfo {
  /** Variable identifier (name) */
  identifier: string;

  /** Type information */
  type?: Format.Type;

  /** Runtime location pointer */
  pointer?: Format.Pointer;

  /** Declaration location in source */
  declaration?: Format.Materials.SourceRange;
}

/**
 * Get the size in bytes for a type
 */
function getTypeSize(bugType: Type): number {
  if (Type.isElementary(bugType)) {
    switch (bugType.kind) {
      case "uint":
      case "int":
        return (bugType.bits || 256) / 8;
      case "address":
        return 20;
      case "bool":
        return 1;
      case "bytes":
        return bugType.size || 32;
      default:
        return 32;
    }
  }
  // For complex types, default to full slot
  return 32;
}

/** A slot plus a number of slots */
function plus(
  slot: Format.Pointer.Expression,
  slots: number,
): Format.Pointer.Expression {
  if (slots === 0) return slot;
  return typeof slot === "number" ? slot + slots : { "~sum": [slot, slots] };
}

/**
 * Generate a sophisticated pointer for a storage variable based on its type
 *
 * Only regions may carry a `name`, so a struct member whose pointer is a
 * collection (a nested struct or an array) cannot be named as a whole.
 * Instead, every region name inside it is qualified by the member's path:
 * `prefix` is that path (e.g. "ceo-" for the members of field `ceo`).
 *
 * A mapping's entries depend on a key, so each mapping in the pointer
 * gets a template for its entry (see `generateMappingPointer`). The
 * templates go in one `templates` collection around the whole pointer.
 */
export function generateStoragePointer(
  baseSlot: Format.Pointer.Expression,
  bugType: Type,
  byteOffset: number = 0,
  prefix: string = "",
  depth: number = 0,
  entries?: Entries,
): Format.Pointer | undefined {
  if (!entries) {
    const templates: Format.Pointer.Templates = {};
    const pointer = generateStoragePointer(
      baseSlot,
      bugType,
      byteOffset,
      prefix,
      depth,
      { templates, scope: "" },
    );
    if (!pointer || Object.keys(templates).length === 0) return pointer;
    return { templates, in: pointer };
  }

  // For structs, generate a group pointer with each field
  if (Type.isStruct(bugType)) {
    const group: Format.Pointer[] = [];

    for (const [fieldName, fieldType] of bugType.fields) {
      const layout = bugType.layout.get(fieldName);
      if (!layout) continue;

      const absoluteOffset = byteOffset + layout.byteOffset;
      const fieldSlot = plus(baseSlot, Math.floor(absoluteOffset / 32));
      const fieldOffset = absoluteOffset % 32;

      const fieldPointer = generateStoragePointer(
        fieldSlot,
        fieldType,
        fieldOffset,
        `${prefix}${fieldName}-`,
        depth,
        entries,
      );
      if (!fieldPointer) continue;

      group.push(
        Format.Pointer.isRegion(fieldPointer)
          ? { ...fieldPointer, name: `${prefix}${fieldName}` }
          : fieldPointer,
      );
    }

    if (group.length === 0) {
      return undefined;
    }

    return { group };
  }

  // For arrays, generate a list pointer, by Solidity's layout (see
  // `Storage`): a fixed-size array's elements start at its slot, a
  // dynamic array's at keccak256 of its slot, where its length is
  if (Type.isArray(bugType)) {
    const element = bugType.element;
    // Each nested list needs its own index variable
    const index = depth === 0 ? "i" : `i${depth}`;
    const first: Format.Pointer.Expression =
      bugType.size === undefined
        ? { "~keccak256": [{ "~wordsized": baseSlot }] }
        : baseSlot;

    let elementPointer: Format.Pointer | undefined;
    const perSlot = Storage.elementsPerSlot(element);
    if (perSlot > 1) {
      // Elements that share a slot, from its low-order end; a pointer's
      // `offset` counts from the high-order end
      const size = Storage.size(element)!;
      elementPointer = {
        name: `${prefix}element`,
        location: "storage",
        slot: { "~sum": [first, { "~quotient": [index, perSlot] }] },
        offset: {
          "~difference": [
            32 - size,
            { "~product": [{ "~remainder": [index, perSlot] }, size] },
          ],
        },
        length: size,
      };
    } else {
      const stride = Storage.slots(element);
      elementPointer = generateStoragePointer(
        {
          "~sum": [
            first,
            stride === 1 ? index : { "~product": [index, stride] },
          ],
        },
        element,
        0,
        prefix,
        depth + 1,
        entries,
      );
      if (elementPointer && Format.Pointer.isRegion(elementPointer)) {
        elementPointer = { ...elementPointer, name: `${prefix}element` };
      }
    }
    if (!elementPointer) return undefined;

    const list: Format.Pointer = {
      list: {
        count:
          bugType.size === undefined
            ? { "~read": `${prefix}array-length` }
            : bugType.size,
        each: index,
        is: elementPointer,
      },
    };
    if (bugType.size !== undefined) return list;

    // Note: "array-length" avoids conflict with Array.prototype.length
    return {
      group: [
        {
          name: `${prefix}array-length`,
          location: "storage",
          slot: baseSlot,
        },
        list,
      ],
    };
  }

  if (Type.isMapping(bugType)) {
    return generateMappingPointer(baseSlot, bugType, prefix, entries);
  }

  if (
    Type.Elementary.isString(bugType) ||
    (Type.Elementary.isBytes(bugType) &&
      Type.Elementary.Bytes.isDynamic(bugType))
  ) {
    return generateStorageBytesPointer(baseSlot, prefix);
  }

  // For elementary types, generate pointer with offset and length
  const size = getTypeSize(bugType);
  const pointer: Format.Pointer = {
    location: "storage",
    slot: baseSlot,
  };

  // bugc packs a field `byteOffset` bytes from the low-order end of its
  // slot, but a pointer's `offset` counts from the high-order end
  const offset = 32 - byteOffset - Math.min(size, 32);
  if (offset > 0) {
    pointer.offset = offset;
  }

  if (size < 32) {
    pointer.length = size;
  }

  return pointer;
}

/**
 * The entry templates of a pointer, and the path of the template being
 * built (empty outside any template), which keeps template names unique
 */
interface Entries {
  templates: Format.Pointer.Templates;
  scope: string;
}

/**
 * A pointer for a storage mapping: a region at its slot, plus (in
 * `entries`) a template for its entry, in the shape solc gives its
 * `t_mapping` templates. The template expects `slot` (the mapping's
 * slot) and `key`; the entry is at keccak256(key . slot), each a word.
 * A value type there is a region named `value`; a struct's members are
 * named `value-<member>`, and so on, as at a variable's own slot.
 *
 * The template is named `entry` for a mapping variable, else after the
 * mapping's region: `<name>-entry` for the mapping member named `name`,
 * or `value-entry` for a mapping in an entry (named inside the outer
 * entry's template, so `value-value-entry` for a mapping two deep).
 */
function generateMappingPointer(
  slot: Format.Pointer.Expression,
  mapping: Type.Mapping,
  prefix: string,
  { templates, scope }: Entries,
): Format.Pointer {
  const value = generateStoragePointer("slot", mapping.value, 0, "value-", 0, {
    templates,
    scope: `${scope}${prefix}`,
  });
  if (value) {
    templates[`${scope}${prefix}entry`] = {
      expect: ["slot", "key"],
      for: {
        define: {
          slot: {
            "~keccak256": [{ "~wordsized": "key" }, { "~wordsized": "slot" }],
          },
        },
        in: Format.Pointer.isRegion(value)
          ? { ...value, name: "value" }
          : value,
      },
    };
  }
  return { location: "storage", slot };
}

/**
 * A pointer for a storage string or dynamic `bytes`, by Solidity's
 * encoding, in the shape solc gives its `t_string_storage` template.
 * The slot's low byte is even for a short value (up to 31 bytes): the
 * slot holds the data, left-aligned, and length * 2 in that byte. Else
 * the slot holds length * 2 + 1, and the data starts at
 * keccak256(slot), in one region across as many slots as it needs.
 */
function generateStorageBytesPointer(
  slot: Format.Pointer.Expression,
  prefix: string,
): Format.Pointer {
  const flag = `${prefix}length-flag`;
  const longLength = `${prefix}long-length`;
  const data = `${prefix}data`;
  return {
    group: [
      {
        name: flag,
        location: "storage",
        slot,
        offset: { "~difference": ["~wordsize", 1] },
        length: 1,
      },
      {
        if: { "~remainder": [{ "~sum": [{ "~read": flag }, 1] }, 2] },
        then: {
          define: { length: { "~quotient": [{ "~read": flag }, 2] } },
          in: { name: data, location: "storage", slot, length: "length" },
        },
        else: {
          group: [
            { name: longLength, location: "storage", slot },
            {
              define: {
                length: {
                  "~quotient": [
                    { "~difference": [{ "~read": longLength }, 1] },
                    2,
                  ],
                },
                start: { "~keccak256": [{ "~wordsized": slot }] },
              },
              in: {
                name: data,
                location: "storage",
                slot: "start",
                length: "length",
              },
            },
          ],
        },
      },
    ],
  };
}

/**
 * Collect all variables with determinable locations from current state
 *
 * At IR generation time, we can only include variables that have
 * concrete runtime locations:
 * - Storage variables (fixed or computed slots)
 * - Memory allocations (if tracked)
 *
 * SSA temps are NOT included because they don't have concrete runtime
 * locations until EVM code generation.
 */
export function collectVariablesWithLocations(
  state: State,
  sourceId: string,
): VariableInfo[] {
  const variables: VariableInfo[] = [];

  // Collect storage variables - these have fixed/known slots
  for (const storageDecl of state.module.storageDeclarations) {
    // Get the resolved BugType from the typechecker
    const bugType = state.types.get(storageDecl.id);
    if (!bugType) {
      // Fallback to simple pointer if no type info
      const location: VariableLocation = {
        kind: "storage",
        slot: storageDecl.slot,
      };
      const pointer = generatePointer(location);
      if (pointer) {
        variables.push({
          identifier: storageDecl.name,
          pointer,
          declaration: storageDecl.loc
            ? {
                source: { id: sourceId },
                range: storageDecl.loc,
              }
            : undefined,
        });
      }
      continue;
    }

    // Generate sophisticated pointer based on type
    const pointer = generateStoragePointer(storageDecl.slot, bugType);
    if (!pointer) continue;

    // Convert Bug type to ethdebug format type
    const type = convertBugType(bugType);

    const declaration: Format.Materials.SourceRange | undefined =
      storageDecl.loc
        ? {
            source: { id: sourceId },
            range: storageDecl.loc,
          }
        : undefined;

    variables.push({
      identifier: storageDecl.name,
      type,
      pointer,
      declaration,
    });
  }

  // TODO: Add memory-allocated variables when we track memory allocations
  // For now, we skip memory variables as we don't track their offsets yet

  // Note: We do NOT include SSA temps here because they don't have
  // concrete runtime locations (stack positions) until EVM codegen

  return variables;
}

/**
 * Convert VariableInfo to ethdebug/format variable context entry
 */
export function toVariableContextEntry(
  variable: VariableInfo,
): Format.Program.Context.Variables["variables"][number] {
  const entry: Format.Program.Context.Variables["variables"][number] = {
    identifier: variable.identifier,
  };

  if (variable.type) {
    entry.type = variable.type;
  }

  if (variable.pointer) {
    entry.pointer = variable.pointer;
  }

  if (variable.declaration) {
    entry.declaration = variable.declaration;
  }

  return entry;
}
