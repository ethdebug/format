import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

// Resolve the package's `#...` imports to source (their `types` entry),
// so tests run against the current code, not a possibly stale `dist/`
const { imports } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const alias = Object.entries(imports)
  .filter(([, target]) => typeof target === "object")
  .map(([name, target]) => ({
    find: new RegExp(`^${name}$`),
    replacement: fileURLToPath(
      new URL((target as { types: string }).types, import.meta.url),
    ),
  }));

export default defineProject({
  resolve: { alias },
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
