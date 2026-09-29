// true when the changelog has a section for the version with at least
// one entry or sentence in it
export function hasReleaseSection(text: string, version: string): boolean {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line === `## ${version}` || line.startsWith(`## ${version} `),
  );
  if (start === -1) {
    return false;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.some(
    (line) =>
      line.trim().length > 0 &&
      !line.startsWith("#") &&
      !/^\[[^\]]+\]: /.test(line),
  );
}

export function hasUnreleasedEntries(text: string): boolean {
  return hasReleaseSection(text, "Unreleased");
}

export interface ChangelogFile {
  path: string;
  version: string;
  text: string | undefined;
}

export function changelogProblems(files: ChangelogFile[]): string[] {
  return files.flatMap(({ path, version, text }) => {
    if (text === undefined) {
      return [`${path}: file is missing`];
    }
    return [
      ...(hasReleaseSection(text, version)
        ? []
        : [`${path}: no "## ${version}" section with an entry`]),
      ...(hasUnreleasedEntries(text)
        ? [`${path}: entries remain under "## Unreleased"`]
        : []),
    ];
  });
}

const impactPrefixes = ["no change needed.", "optional:", "required:"];

// a real sub-item is indented two spaces and has a bare label; the intro
// bullets that describe the sub-items start at column 0 with a code span
const impactLabel = /^ {2}- (Producers|Consumers):(.*)$/;

function startsWithImpactPrefix(text: string): boolean {
  return impactPrefixes.some(
    (prefix) =>
      text.startsWith(prefix) &&
      (text.length === prefix.length || /\s/.test(text[prefix.length])),
  );
}

export function impactLineProblems(text: string): string[] {
  const lines = text.split("\n");
  const allowed = impactPrefixes.map((prefix) => `"${prefix}"`).join(", ");
  return lines.flatMap((line, index) => {
    const match = impactLabel.exec(line);
    if (!match) {
      return [];
    }
    const [, label, rest] = match;
    // the text starts on the label line after one space, or, when the
    // label stands alone, on the continuation line below it
    const conforms =
      rest.trim().length > 0
        ? rest.startsWith(" ") && startsWithImpactPrefix(rest.slice(1))
        : startsWithImpactPrefix((lines[index + 1] ?? "").trimStart());
    return conforms
      ? []
      : [`line ${index + 1}: "${label}:" must start with one of: ${allowed}`];
  });
}

const sectionNames = ["Added", "Changed"];

// the prefixes carry the obligations, so a section only says whether a
// change adds something new or alters something that exists
export function sectionProblems(text: string): string[] {
  const allowed = sectionNames.map((name) => `"### ${name}"`).join(", ");
  return text.split("\n").flatMap((line, index) => {
    if (!line.startsWith("### ")) {
      return [];
    }
    return sectionNames.includes(line.slice(4).trim())
      ? []
      : [`line ${index + 1}: section heading must be one of: ${allowed}`];
  });
}

export function formatProblemsMessage(problems: string[]): string {
  if (problems.length === 0) {
    return "";
  }
  return [
    "CHANGELOG.md does not follow the entry format:",
    ...problems.map((problem) => `  ${problem}`),
  ].join("\n");
}
