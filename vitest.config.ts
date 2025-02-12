import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    workspace: ["packages/*"],
    coverage: {
      enabled: true,
      exclude: [
        ...coverageConfigDefaults.exclude,
        "./bin/**",
        "./packages/web/**",
        "./packages/format/bin/**",
        "./packages/pointers/bin/**",
        "**/dist/**"
      ],
    }
  }
});
