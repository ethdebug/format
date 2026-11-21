import semver from "semver";

// the schemas ship inside this package, so its version is the version
// of the specification
export const specPackage = "@ethdebug/format";

export const scope = "@ethdebug/";

export const keywords = [
  "prerelease",
  "patch",
  "preminor",
  "premajor",
  "minor",
  "major",
] as const;
export type Keyword = (typeof keywords)[number];

// a series start moves every workspace to the same major.minor
export const seriesStartKeywords: Keyword[] = [
  "preminor",
  "premajor",
  "minor",
  "major",
];

// files whose change does not call for a release; the same list goes
// to `lerna changed` and to the direct-change diff, so the two agree
export const ignoredChanges = [
  "**/CHANGELOG.md",
  "**/*.test.ts",
  "**/*.test.tsx",
];

export function identifierFor(name: string): "draft" | "preview" {
  return name === specPackage ? "draft" : "preview";
}

export function isPrerelease(version: string): boolean {
  return (semver.prerelease(version) ?? []).length > 0;
}

export function tuple(version: string): string {
  const parsed = semver.parse(version);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : "";
}

// A stable version is `latest` when nothing stable is higher; a
// prerelease is `latest` only while the package has no stable version,
// and its identifier (`draft`, `preview`) after that. CI can set one
// tag per publish, so this is the only tag a version gets.
export function distTag(version: string, knownVersions: string[]): string {
  const stable = knownVersions.filter(
    (known) =>
      semver.valid(known) !== null && semver.prerelease(known) === null,
  );
  const prerelease = semver.prerelease(version);
  if (prerelease === null) {
    const highest = [version, ...stable].sort(semver.rcompare)[0];
    return highest === version
      ? "latest"
      : `release-${semver.major(version)}.${semver.minor(version)}`;
  }
  if (stable.length === 0) {
    return "latest";
  }
  const identifier = prerelease[0];
  if (
    typeof identifier !== "string" ||
    semver.validRange(identifier) !== null
  ) {
    throw new Error(
      `${version}: prerelease identifier "${identifier}" is not a ` +
        "valid dist-tag",
    );
  }
  return identifier;
}

export function releaseTag(name: string, version: string): string {
  return `${name}@${version}`;
}

export function parseReleaseTag(
  tag: string,
): { name: string; version: string } | undefined {
  const match = /^(@ethdebug\/[^@]+)@(.+)$/.exec(tag.trim());
  return match ? { name: match[1], version: match[2] } : undefined;
}

export function isReleaseTag(tag: string): boolean {
  return parseReleaseTag(tag) !== undefined;
}

// the versions a workspace has been released at, from the full tag
// list; replaces one `git tag --list <name>@*` call per workspace.
// Only valid semver versions count, as `localTagVersions` always did.
export function releaseVersions(tags: string[], name: string): string[] {
  return tags
    .map(parseReleaseTag)
    .filter((parsed) => parsed?.name === name)
    .map((parsed) => parsed!.version)
    .filter((version) => semver.valid(version) !== null);
}
