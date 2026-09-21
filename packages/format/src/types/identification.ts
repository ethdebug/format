import semver from "semver";
import { version } from "#version";

export interface Identification {
  schema: string;
  version: string;
}

// the same pattern as schemas/identification.schema.yaml: semver without
// build metadata; semver.valid alone would coerce a v prefix or whitespace
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

export const isIdentification = (value: unknown): value is Identification =>
  typeof value === "object" &&
  !!value &&
  "schema" in value &&
  typeof value.schema === "string" &&
  "version" in value &&
  typeof value.version === "string" &&
  versionPattern.test(value.version) &&
  Object.keys(value).length === 2;

export type RootSchemaId =
  | "schema:ethdebug/format/info"
  | "schema:ethdebug/format/info/resources"
  | "schema:ethdebug/format/program";

// what a producer built against this package writes
export const identify = (schema: RootSchemaId): Identification => ({
  schema,
  version,
});

// the compatibility key: the major version, or major.minor while the
// major is 0 (semver treats 0.x minors as breaking)
function compatibilityKey(value: string): string | undefined {
  const parsed = semver.parse(value);
  if (!parsed) {
    return undefined;
  }
  return parsed.major === 0 ? `0.${parsed.minor}` : String(parsed.major);
}

export const supports = (
  version: string,
  supported: string,
): "ok" | "newer" | "unsupported" => {
  const key = compatibilityKey(version);
  const supportedKey = compatibilityKey(supported);
  if (key === undefined || supportedKey === undefined || key !== supportedKey) {
    return "unsupported";
  }
  return semver.gt(version, supported) ? "newer" : "ok";
};
