export namespace Data {
  export type Value = Unsigned | Hex;

  export const isValue = (value: unknown): value is Value =>
    [isUnsigned, isHex].some((guard) => guard(value));

  export type Unsigned = number;

  export const isUnsigned = (value: unknown): value is Unsigned =>
    typeof value === "number" && value >= 0;

  export type Hex = string;

  const hexPattern = new RegExp(/^0x[0-9a-fA-F]{1,}$/);

  export const isHex = (value: unknown): value is Hex =>
    typeof value === "string" && hexPattern.test(value);
}
