import { Materials } from "#types/materials";
import { Type } from "#types/type";
import { Pointer, isPointer } from "#types/pointer";

export type Context =
  | Context.Code
  | Context.Variables
  | Context.Remark
  | Context.Pick
  | Context.Gather
  | Context.Frame
  | Context.Invoke
  | Context.Return
  | Context.Revert;

export const isContext = (value: unknown): value is Context =>
  [
    Context.isCode,
    Context.isVariables,
    Context.isRemark,
    Context.isPick,
    Context.isFrame,
    Context.isGather,
    Context.isInvoke,
    Context.isReturn,
    Context.isRevert,
  ].some((guard) => guard(value));

export namespace Context {
  export interface Code {
    code: Materials.SourceRange;
  }

  export const isCode = (value: unknown): value is Code =>
    typeof value === "object" &&
    !!value &&
    "code" in value &&
    Materials.isSourceRange(value.code);

  export interface Variables {
    variables: Variables.Variable[];
  }

  export const isVariables = (value: unknown): value is Variables =>
    typeof value === "object" &&
    !!value &&
    "variables" in value &&
    value.variables instanceof Array &&
    value.variables.length > 0 &&
    value.variables.every(Variables.isVariable);

  export namespace Variables {
    export interface Variable {
      identifier?: string;
      declaration?: Materials.SourceRange;
      type?: Type.Specifier;
      pointer?: Pointer;
    }

    const allowedKeys = new Set([
      "identifier",
      "declaration",
      "type",
      "pointer",
    ]);

    export const isVariable = (value: unknown): value is Variable =>
      typeof value === "object" &&
      !!value &&
      Object.keys(value).length > 0 &&
      Object.keys(value).every((key) => allowedKeys.has(key)) &&
      (!("identifier" in value) || typeof value.identifier === "string") &&
      (!("declaration" in value) ||
        Materials.isSourceRange(value.declaration)) &&
      (!("type" in value) || Type.isSpecifier(value.type)) &&
      (!("pointer" in value) || isPointer(value.pointer));
  }

  export interface Remark {
    remark: string;
  }

  export const isRemark = (value: unknown): value is Remark =>
    typeof value === "object" &&
    !!value &&
    "remark" in value &&
    typeof value.remark === "string";

  export interface Pick {
    pick: Context[];
  }

  export const isPick = (value: unknown): value is Pick =>
    typeof value === "object" &&
    !!value &&
    "pick" in value &&
    Array.isArray(value.pick) &&
    value.pick.every(isContext);

  export interface Gather {
    gather: Context[];
  }

  export const isGather = (value: unknown): value is Gather =>
    typeof value === "object" &&
    !!value &&
    "gather" in value &&
    Array.isArray(value.gather) &&
    value.gather.every(isContext);

  export interface Frame {
    frame: string;
  }

  export const isFrame = (value: unknown): value is Frame =>
    typeof value === "object" &&
    !!value &&
    "frame" in value &&
    typeof value.frame === "string";

  export namespace Function {
    export interface Identity {
      identifier?: string;
      declaration?: Materials.SourceRange;
      type?: Type.Specifier;
    }

    export const isIdentity = (value: unknown): value is Identity =>
      typeof value === "object" &&
      !!value &&
      (!("identifier" in value) || typeof value.identifier === "string") &&
      (!("declaration" in value) ||
        Materials.isSourceRange(value.declaration)) &&
      (!("type" in value) || Type.isSpecifier(value.type));

    export interface PointerRef {
      pointer: Pointer;
    }

    export const isPointerRef = (value: unknown): value is PointerRef =>
      typeof value === "object" &&
      !!value &&
      "pointer" in value &&
      isPointer(value.pointer);
  }

  export interface Invoke {
    invoke: Invoke.Invocation;
  }

  export const isInvoke = (value: unknown): value is Invoke =>
    typeof value === "object" &&
    !!value &&
    "invoke" in value &&
    Invoke.isInvocation(value.invoke);

  export namespace Invoke {
    export type Invocation = Function.Identity &
      (
        | Invocation.InternalCall
        | Invocation.ExternalCall
        | Invocation.ContractCreation
      );

    export const isInvocation = (value: unknown): value is Invocation =>
      Function.isIdentity(value) &&
      (Invocation.isInternalCall(value) ||
        Invocation.isExternalCall(value) ||
        Invocation.isContractCreation(value));

    export namespace Invocation {
      export interface InternalCall extends Function.Identity {
        jump: true;
        target: Function.PointerRef;
        arguments?: Function.PointerRef;
      }

      export const isInternalCall = (value: unknown): value is InternalCall =>
        typeof value === "object" &&
        !!value &&
        "jump" in value &&
        value.jump === true &&
        "target" in value &&
        Function.isPointerRef(value.target) &&
        (!("arguments" in value) || Function.isPointerRef(value.arguments));

      export interface ExternalCall extends Function.Identity {
        message: true;
        target: Function.PointerRef;
        gas?: Function.PointerRef;
        value?: Function.PointerRef;
        input?: Function.PointerRef;
        delegate?: true;
        static?: true;
      }

      export const isExternalCall = (value: unknown): value is ExternalCall =>
        typeof value === "object" &&
        !!value &&
        "message" in value &&
        value.message === true &&
        "target" in value &&
        Function.isPointerRef(value.target) &&
        (!("gas" in value) || Function.isPointerRef(value.gas)) &&
        (!("value" in value) || Function.isPointerRef(value.value)) &&
        (!("input" in value) || Function.isPointerRef(value.input)) &&
        (!("delegate" in value) || value.delegate === true) &&
        (!("static" in value) || value.static === true);

      export interface ContractCreation extends Function.Identity {
        create: true;
        value?: Function.PointerRef;
        salt?: Function.PointerRef;
        input?: Function.PointerRef;
      }

      export const isContractCreation = (
        value: unknown,
      ): value is ContractCreation =>
        typeof value === "object" &&
        !!value &&
        "create" in value &&
        value.create === true &&
        (!("value" in value) || Function.isPointerRef(value.value)) &&
        (!("salt" in value) || Function.isPointerRef(value.salt)) &&
        (!("input" in value) || Function.isPointerRef(value.input));
    }
  }

  export interface Return {
    return: Return.Info;
  }

  export const isReturn = (value: unknown): value is Return =>
    typeof value === "object" &&
    !!value &&
    "return" in value &&
    Return.isInfo(value.return);

  export namespace Return {
    export interface Info extends Function.Identity {
      data?: Function.PointerRef;
      success?: Function.PointerRef;
    }

    export const isInfo = (value: unknown): value is Info =>
      Function.isIdentity(value) &&
      typeof value === "object" &&
      !!value &&
      (!("data" in value) || Function.isPointerRef(value.data)) &&
      (!("success" in value) || Function.isPointerRef(value.success));
  }

  export interface Revert {
    revert: Revert.Info;
  }

  export const isRevert = (value: unknown): value is Revert =>
    typeof value === "object" &&
    !!value &&
    "revert" in value &&
    Revert.isInfo(value.revert);

  export namespace Revert {
    export interface Info extends Function.Identity {
      reason?: Function.PointerRef;
      panic?: number;
    }

    export const isInfo = (value: unknown): value is Info =>
      Function.isIdentity(value) &&
      typeof value === "object" &&
      !!value &&
      (!("reason" in value) || Function.isPointerRef(value.reason)) &&
      (!("panic" in value) || typeof value.panic === "number");
  }
}
