import { Data } from "./data.js";

export namespace Materials {
  export type Id =
    | number
    | string;

  export const isId = (value: unknown): value is Id =>
    ["number", "string"].includes(typeof value);

  // this and `toReference` are a bit janky to ensure Reference<X> can't
  // be assigned to Reference<Y> unless X can be assigned to Y
  export type Reference<O extends { id: Id; }> = OmitNever<
    & OmitNever<{
        [K in keyof O]-?: K extends "id" ? O[K] : never;
      }>
    & (
        Reference.Type<O> extends string
          ? { type?: Reference.Type<O>; }
          : { type?: string;}
      )
  >;

  export const isReference = <O extends { id: Id; }>(
    value: unknown
  ): value is Reference<O> =>
    typeof value === "object" && !!value &&
      "id" in value && isId(value.id);

  export function toReference<O extends { id: Id; }>(object: O): Reference<O> {
    return {
      id: object.id,
      ...(
        ([
          [isCompilation, "compilation"],
          [isSource, "source"]
        ] as const)
          .filter(([guard]) => guard(object))
          .map(([_, type]) => ({ type }))
          [0] || {}
      )
    } as unknown as Reference<O>;
  }


  type OmitNever<T> = {
    [K in keyof T as T[K] extends never ? never : K]: T[K]
  };


  export namespace Reference {
    export type Type<O extends { id: Id; }> = {
      [T in keyof Types]: O extends Types[T] ? T : never;
    }[keyof Types];


    type Types = {
      "compilation": Compilation,
      "source": Source
    };

  }

  export interface Compilation {
    id: Id;
    compiler: {
      name: string;
      version: string;
    };
    settings?: any;
    sources: Source[];
  }

  export const isCompilation = (value: unknown): value is Compilation =>
    typeof value === "object" && !!value &&
      "id" in value && isId(value.id) &&
      "compiler" in value && typeof value.compiler === "object" && !!value.compiler &&
        "name" in value.compiler && typeof value.compiler.name === "string" &&
        "version" in value.compiler && typeof value.compiler.version === "string" &&
      "sources" in value && value.sources instanceof Array &&
        value.sources.every(isSource);

  export interface Source {
    id: Id;
    path: string;
    contents: string;
    encoding?: string;
    language: string;
  }

  export const isSource = (value: unknown): value is Source =>
    typeof value === "object" && !!value &&
      "id" in value && isId(value.id) &&
      "path" in value && typeof value.path === "string" &&
      "contents" in value && typeof value.contents === "string" &&
      "language" in value && typeof value.language === "string" &&
      (
        !("encoding" in value) || typeof value.encoding === "string"
      );


  export interface SourceRange {
    compilation?: Reference<Compilation>;
    source: Reference<Source>;
    range?: {
      offset: Data.Value;
      length: Data.Value;
    };
  }

  export const isSourceRange = (value: unknown): value is SourceRange =>
    typeof value === "object" && !!value &&
      "source" in value && isReference<Source>(value.source) &&
      (
        !("range" in value) ||
        (
          typeof value.range === "object" && !!value.range &&
            "offset" in value.range && Data.isValue(value.range.offset) &&
            "length" in value.range && Data.isValue(value.range.length)
        )
      ) &&
      (
        !("compilation" in value) || isReference<Compilation>(value.compilation)
      );

}
