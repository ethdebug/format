import type { Pointer } from "@ethdebug/format";
import type { Cursor } from "../cursor.js";
import type { Data } from "../data.js";

/**
 * A single state transition for processing on a stack
 */
export type Memo =
  | Memo.DereferencePointer
  | Memo.SaveRegions
  | Memo.SaveVariables
  | Memo.PushRegionRenames
  | Memo.PopRegionRenames
  | Memo.PushTemplates
  | Memo.PopTemplates;

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

  /**
   * A request to push a region rename mapping onto the context stack.
   * While active, regions with names in the mapping will be saved under
   * both their original name (for internal references) and their new name
   * (for external references after the template).
   */
  export interface PushRegionRenames {
    kind: "push-region-renames";
    mapping: Record<string, string>;
  }

  /**
   * Initialize a PushRegionRenames memo
   */
  export const pushRegionRenames =
    (mapping: Record<string, string>): PushRegionRenames => ({
      kind: "push-region-renames",
      mapping
    });

  /**
   * A request to pop the current region rename mapping from the context stack.
   */
  export interface PopRegionRenames {
    kind: "pop-region-renames";
  }

  /**
   * Initialize a PopRegionRenames memo
   */
  export const popRegionRenames = (): PopRegionRenames => ({
    kind: "pop-region-renames"
  });

  /**
   * A request to push template definitions onto the context stack.
   * While active, these templates are available for use by reference
   * collections.
   */
  export interface PushTemplates {
    kind: "push-templates";
    templates: Pointer.Templates;
  }

  /**
   * Initialize a PushTemplates memo
   */
  export const pushTemplates =
    (templates: Pointer.Templates): PushTemplates => ({
      kind: "push-templates",
      templates
    });

  /**
   * A request to pop the current template definitions from the context stack.
   */
  export interface PopTemplates {
    kind: "pop-templates";
  }

  /**
   * Initialize a PopTemplates memo
   */
  export const popTemplates = (): PopTemplates => ({
    kind: "pop-templates"
  });
}
