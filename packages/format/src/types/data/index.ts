import { version } from "#version";

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

  export interface Stamp {
    schema:
      | "ethdebug/format/info"
      | "ethdebug/format/info/resources"
      | "ethdebug/format/program";
    version: string;
  }

  // the given object, stamped with the given root schema and this version
  export const stamp = <S extends Stamp["schema"], O extends object>(
    schema: S,
    unstamped: O,
  ): { ethdebug: Stamp & { schema: S } } & O => ({
    ethdebug: { schema, version },
    ...unstamped,
  });

  // the pattern from schemas/data/stamp.schema.yaml
  export const versionPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

  export const isStamp = (value: unknown): value is Stamp =>
    typeof value === "object" &&
    !!value &&
    "schema" in value &&
    typeof value.schema === "string" &&
    "version" in value &&
    typeof value.version === "string" &&
    versionPattern.test(value.version) &&
    Object.keys(value).length === 2;
}
