import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  distTag,
  isReleaseTag,
  parseReleaseTag,
  releaseTag,
  releaseVersions,
} from "./policy.js";

describe("releaseTag and parseReleaseTag", () => {
  it("round-trip a name and version", () => {
    const tag = releaseTag("@ethdebug/format", "0.1.0-draft.0");
    expect(tag).toBe("@ethdebug/format@0.1.0-draft.0");
    expect(parseReleaseTag(tag)).toEqual({
      name: "@ethdebug/format",
      version: "0.1.0-draft.0",
    });
  });

  it("rejects tags that are not @ethdebug release tags", () => {
    for (const tag of ["v1", "@other/x@1.0.0", "@ethdebug/format", ""]) {
      expect(parseReleaseTag(tag)).toBeUndefined();
      expect(isReleaseTag(tag)).toBe(false);
    }
  });
});

describe("releaseVersions", () => {
  it("returns the versions of one workspace only", () => {
    expect(
      releaseVersions(
        [
          "@ethdebug/format@0.1.0-1",
          "@ethdebug/format-web@0.1.0-1",
          "@ethdebug/format@0.1.0-draft.0",
          "v1",
        ],
        "@ethdebug/format",
      ),
    ).toEqual(["0.1.0-1", "0.1.0-draft.0"]);
  });

  it("drops versions that are not valid semver", () => {
    expect(
      releaseVersions(
        ["@ethdebug/format@0.1.0", "@ethdebug/format@nightly"],
        "@ethdebug/format",
      ),
    ).toEqual(["0.1.0"]);
  });
});

// Vacuous on a shallow clone with no tags, by design: CI fetches none.
// The fixed examples above carry the predicate there.
describe("the repository's real tags", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const list = (args: string[]): string[] =>
    execFileSync("git", ["tag", "--list", ...args], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((tag) => tag.length > 0);
  const all = list([]);
  // the glob the scripts use today
  const globbed = list(["@ethdebug/*@*"]);

  it("treat exactly the tags the release glob matches as release tags", () => {
    expect(all.filter(isReleaseTag).sort()).toEqual([...globbed].sort());
  });

  it("round-trip every release tag through releaseTag", () => {
    for (const tag of all.filter(isReleaseTag)) {
      const parsed = parseReleaseTag(tag)!;
      expect(releaseTag(parsed.name, parsed.version), tag).toBe(tag);
    }
  });
});

describe("distTag", () => {
  it(
    "publishes a prerelease under latest while no stable version " + "exists",
    () => {
      expect(distTag("0.1.0-draft.0", ["0.1.0-0", "0.1.0-1", "0.1.0-2"])).toBe(
        "latest",
      );
      expect(distTag("0.1.0-preview.0", [])).toBe("latest");
    },
  );

  it("publishes a prerelease under its identifier once a stable exists", () => {
    expect(distTag("0.2.0-draft.0", ["0.1.0"])).toBe("draft");
    expect(distTag("0.2.0-draft.0", ["0.1.0-draft.3", "0.1.0"])).toBe("draft");
    expect(distTag("0.2.0-preview.1", ["0.1.0"])).toBe("preview");
  });

  it("publishes the highest stable version under latest", () => {
    expect(distTag("0.1.0", ["0.1.0-draft.4"])).toBe("latest");
    expect(distTag("0.2.1", ["0.1.0", "0.2.0"])).toBe("latest");
  });

  it("keeps latest from moving backwards on a back-port", () => {
    expect(distTag("0.1.1", ["0.1.0", "0.2.0"])).toBe("release-0.1");
  });

  it("rejects an identifier that is not a valid tag name", () => {
    expect(() => distTag("0.1.0-3", ["0.1.0"])).toThrow(/dist-tag/);
  });
});
