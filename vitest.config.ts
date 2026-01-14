import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.d.ts",
        "packages/web/**",
        "**/vitest.config.ts",
        "**/vitest.setup.ts",
        "**/jest.config.ts",
        "**/bin/**",
      ],
    },
  },
});
