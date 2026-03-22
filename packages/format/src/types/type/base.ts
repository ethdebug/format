export type Type = Elementary | Complex;

export const isType = (value: unknown): value is Type =>
  [isElementary, isComplex].some((guard) => guard(value));

export interface Elementary {
  class?: "elementary";
  kind: string;
}

export const isElementary = (value: unknown): value is Elementary =>
  typeof value === "object" &&
  !!value &&
  "kind" in value &&
  typeof value.kind === "string" &&
  (!("class" in value) || value.class === "elementary") &&
  !("contains" in value);

export interface Complex {
  class?: "complex";
  kind: string;
  contains:
    | Wrapper
    | Wrapper[]
    | {
        [key: string]: Wrapper;
      };
}

export const isComplex = (value: unknown): value is Complex =>
  typeof value === "object" &&
  !!value &&
  "kind" in value &&
  typeof value.kind === "string" &&
  (!("class" in value) || value.class === "complex") &&
  "contains" in value &&
  !!value.contains &&
  (isWrapper(value.contains) ||
    (value.contains instanceof Array && value.contains.every(isWrapper)) ||
    (typeof value.contains === "object" &&
      Object.values(value.contains).every(isWrapper)));

export interface Wrapper {
  type: Type | { id: any };
}

export const isWrapper = (value: unknown): value is Wrapper =>
  typeof value === "object" &&
  !!value &&
  "type" in value &&
  (isType(value.type) ||
    (typeof value.type === "object" && !!value.type && "id" in value.type));
