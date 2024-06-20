import type { Pointer } from "../pointer.js";
import type { Cursor } from "../cursor.js";
import type { Data } from "../data.js";

/**
 * A single state transition for processing on a stack
 */
export type Memo =
  | Memo.DereferencePointer
  | Memo.SaveRegions
  | Memo.SaveVariables;

export namespace Memo {
  /**
   * A request to dereference a pointer
   */
  export interface DereferencePointer {
    kind: "dereference-pointer";
    pointer: Pointer;
  }

  /**
   * Initialize a DereferencePointer memo
   */
  export const dereferencePointer =
    (pointer: Pointer): DereferencePointer => ({
      kind: "dereference-pointer",
      pointer
    });

  /**
   * A request to modify the stateful map of regions by name with a
   * particular set of new entries.
   *
   * This does not indicate that any change should be made to region names not
   * included in this memo.
   */
  export interface SaveRegions {
    kind: "save-regions";
    regions: Record<string, Cursor.Region>;
  }

  /**
   * Initialize a SaveRegions memo
   */
  export const saveRegions =
    (regions: Record<string, Cursor.Region>): SaveRegions => ({
      kind: "save-regions",
      regions
    });

  /**
   * A request to modify the stateful map of variable values with a
   * particular set of new entries.
   *
   * This does not indicate that any change should be made to variables not
   * included in this memo.
   */
  export interface SaveVariables {
    kind: "save-variables";
    variables: Record<string, Data>;
  }

  /**
   * Initialize a SaveVariables memo
   */
  export const saveVariables =
    (variables: Record<string, Data>): SaveVariables => ({
      kind: "save-variables",
      variables
    });
}
