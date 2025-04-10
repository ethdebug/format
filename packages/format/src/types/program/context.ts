import { Materials } from "../materials";
import { Type, isType } from "../type";
import { Pointer, isPointer } from "../pointer";

export type Context =
  | Context.Code
  | Context.Variables
  | Context.Remark
  | Context.Pick;

export const isContext = (value: unknown): value is Context => [
  Context.isCode,
  Context.isVariables,
  Context.isRemark,
  Context.isPick,
].some(guard => guard(value));

export namespace Context {
  export interface Code {
    code: Materials.SourceRange;
  }

  export const isCode = (value: unknown): value is Code =>
    typeof value === "object" && !!value &&
      "code" in value && Materials.isSourceRange(value.code);

  export interface Variables {
    variables: Variables.Variable[]
  }

  export const isVariables = (value: unknown): value is Variables =>
    typeof value === "object" && !!value &&
      "variables" in value && value.variables instanceof Array &&
      value.variables.length > 0 &&
      value.variables.every(Variables.isVariable);

  export namespace Variables {
    export interface Variable {
      identifier?: string;
      declaration?: Materials.SourceRange;
      type?: Type;
      pointer?: Pointer;
    }

    const allowedKeys = new Set([
      "identifier",
      "declaration",
      "type",
      "pointer"
    ]);

    export const isVariable = (value: unknown): value is Variable =>
      typeof value === "object" && !!value &&
        Object.keys(value).length > 0 &&
        Object.keys(value).every(key => allowedKeys.has(key)) &&
        (
          !("identifier" in value) ||
            typeof value.identifier === "string"
        ) &&
        (
          !("declaration" in value) ||
            Materials.isSourceRange(value.declaration)
        ) &&
        (
          !("type" in value) ||
            isType(value.type)
        ) &&
        (
          !("pointer" in value) ||
            isPointer(value.pointer)
        );
  }

  export interface Remark {
    remark: string;
  }

  export const isRemark = (value: unknown): value is Remark =>
    typeof value === "object" && !!value &&
      "remark" in value && typeof value.remark === "string";

  export interface Pick {
    pick: Context[];
  }

  export const isPick = (value: unknown): value is Pick =>
    typeof value === "object" && !!value &&
      "pick" in value && value.pick instanceof Array &&
      value.pick.every(isContext);
}
