import type { Pointer } from "../pointer.js";
import type { Cursor } from "../cursor.js";
import type { Data } from "../data.js";

export type Memo =
  | Memo.EvaluatePointer
  | Memo.SaveRegions
  | Memo.SaveVariables;

export namespace Memo {
  export interface EvaluatePointer {
    kind: "evaluate-pointer";
    pointer: Pointer;
  }

  export const evaluatePointer =
    (pointer: Pointer): EvaluatePointer => ({
      kind: "evaluate-pointer",
      pointer
    });


  export interface SaveRegions {
    kind: "save-regions";
    regions: Record<string, Cursor.Region>;
  }

  export const saveRegions =
    (regions: Record<string, Cursor.Region>): SaveRegions => ({
      kind: "save-regions",
      regions
    });

  export interface SaveVariables {
    kind: "save-variables";
    variables: Record<string, Data>;
  }

  export const saveVariables =
    (variables: Record<string, Data>): SaveVariables => ({
      kind: "save-variables",
      variables
    });
}
