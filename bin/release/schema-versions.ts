import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { isMap, isScalar, isSeq, parseDocument } from "yaml";

// a `version` scalar that a release rewrites: the version field of a
// stamp sitting inside a schema's top-level `examples`
export interface Site {
  // a path like "examples/0/ethdebug", for messages
  path: string;
  line: number;
  version: string;
  // byte range of the scalar token, quotes included
  range: [number, number];
}

export interface SchemaFile {
  // relative to the repository root
  path: string;
  text: string;
  sites: Site[];
}

const schemaNamePrefix = "ethdebug/format/";

// a stamp is any mapping with a `schema` value that starts with
// `ethdebug/format/` and a `version` beside it.
function collect(node: unknown, path: string, text: string, out: Site[]) {
  if (isMap(node)) {
    const schema = node.get("schema");
    const version = node.get("version", true);
    if (
      typeof schema === "string" &&
      schema.startsWith(schemaNamePrefix) &&
      isScalar(version) &&
      typeof version.value === "string" &&
      version.range
    ) {
      out.push({
        path,
        line: text.slice(0, version.range[0]).split("\n").length,
        version: version.value,
        range: [version.range[0], version.range[1]],
      });
    }
    for (const item of node.items) {
      const key = String(
        (isScalar(item.key) ? item.key.value : undefined) ?? "?",
      );
      collect(item.value, `${path}/${key}`, text, out);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) =>
      collect(item, `${path}/${index}`, text, out),
    );
  }
}

export function versionSites(text: string): Site[] {
  const examples = parseDocument(text).get("examples", true);
  const out: Site[] = [];
  if (examples) {
    collect(examples, "examples", text, out);
  }
  return out.sort((a, b) => a.range[0] - b.range[0]);
}

// splices each site into the original bytes, so comments, spacing and
// the long block descriptions survive exactly.
export function setVersions(text: string, to: string): string {
  let result = "";
  let cursor = 0;
  for (const site of versionSites(text)) {
    const [start, end] = site.range;
    const original = text.slice(start, end);
    const quote = original.startsWith('"')
      ? '"'
      : original.startsWith("'")
        ? "'"
        : "";
    result += text.slice(cursor, start) + `${quote}${to}${quote}`;
    cursor = end;
  }
  return result + text.slice(cursor);
}

// every site must already name the version the package carries; one
// that does not means a schema example drifted from the release
export function checkVersions(file: SchemaFile, expected: string): string[] {
  return file.sites
    .filter((site) => site.version !== expected)
    .map(
      (site) =>
        `${file.path}:${site.line}: ${site.path} names ` +
        `${site.version}, expected ${expected}`,
    );
}

function schemaPaths(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return schemaPaths(path);
    }
    return entry.name.endsWith(".schema.yaml") ? [path] : [];
  });
}

export function readSchemas(root: string): SchemaFile[] {
  return schemaPaths(join(root, "schemas"))
    .sort()
    .map((path) => {
      const text = readFileSync(path, "utf8");
      return { path: relative(root, path), text, sites: versionSites(text) };
    });
}
