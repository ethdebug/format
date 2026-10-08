import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

// resolve the package's `#...` imports to source, so the check does not
// depend on a fresh `dist/`
const { imports } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const sourceImports: Plugin = {
  name: "source-imports",
  setup(build) {
    build.onResolve({ filter: /^#/ }, ({ path }) => ({
      path: fileURLToPath(
        new URL(imports[path].types, `file://${packageRoot}`),
      ),
    }));
  },
};

const bundle = async (contents: string) => {
  const { metafile, outputFiles } = await build({
    stdin: { contents, resolveDir: packageRoot, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [sourceImports],
  });

  // only the inputs that contribute code to the output
  const [{ inputs }] = Object.values(metafile.outputs);
  return {
    inputs: Object.keys(inputs).filter((input) => inputs[input].bytesInOutput),
    gzipped: gzipSync(outputFiles[0].contents).length,
  };
};

const isSchemaInput = (input: string) =>
  input.includes("node_modules/yaml/") || input.endsWith("yamls.ts");

describe("bundling the package root", () => {
  it("leaves out the schemas when they are not imported", async () => {
    const { inputs, gzipped } = await bundle(
      `import { isPointer } from "./src/index.js";
       globalThis.result = isPointer({});`,
    );

    expect(inputs.filter(isSchemaInput)).toEqual([]);
    expect(gzipped).toBeLessThan(10_000);
  });

  it("includes the schemas when they are imported", async () => {
    const { inputs } = await bundle(
      `import { schemas } from "./src/index.js";
       globalThis.result = schemas;`,
    );

    expect(inputs.filter(isSchemaInput)).not.toEqual([]);
  });
});
