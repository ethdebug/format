// Generates src/examples/generated.ts from the canonical `.bug` example
// files under packages/bugc/examples. Bundlers like webpack (used by the
// docs site) can't glob raw `.bug` files the way Vite can, so we surface
// the sources as an importable module of string literals — the same
// pattern as @ethdebug/format's generated schemas/yamls.ts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const examplesRoot = path.resolve(__dirname, "../examples");

// Walk examplesRoot recursively, collecting `.bug` sources keyed by their
// path relative to examplesRoot (POSIX separators, so keys are stable
// across platforms).
const readExamples = (directory) => {
  const sources = {};
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(sources, readExamples(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".bug")) {
      const relativePath = path
        .relative(examplesRoot, fullPath)
        .split(path.sep)
        .join("/");
      sources[relativePath] = fs.readFileSync(fullPath, "utf8");
    }
  }

  return sources;
};

// Sort keys so the generated output is deterministic.
const collected = readExamples(examplesRoot);
const exampleSources = {};
for (const key of Object.keys(collected).sort()) {
  exampleSources[key] = collected[key];
}

const output = `// THIS FILE GETS AUTO-GENERATED AS PART OF THIS PACKAGE'S BUILD PROCESS
// Please do not modify it directly or allow it to get checked into source control.

export type ExampleSourcesByPath = {
  [path: string]: string;
};

export const exampleSources: ExampleSourcesByPath = ${JSON.stringify(
  exampleSources,
  undefined,
  2,
)};
`;

const outputDir = path.resolve(__dirname, "../src/examples");
const outputPath = path.join(outputDir, "generated.ts");
const tempPath = outputPath + ".tmp";

fs.mkdirSync(outputDir, { recursive: true });

// Write to a temp file, then rename atomically to avoid race conditions.
fs.writeFileSync(tempPath, output);
fs.renameSync(tempPath, outputPath);
