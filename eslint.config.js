import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": "warn",
      "require-yield": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../types/*/index*", "../types/*/index"],
              message: "Use #types/* alias instead of relative imports",
            },
            {
              group: [
                "../materials/*",
                "../data/*",
                "../pointer/*",
                "../program/*",
                "../type/*",
              ],
              message: "Use #types/* alias instead of relative imports",
            },
            {
              group: ["../../test/*", "../../../test/*"],
              message: "Use #test/* alias instead of relative imports",
            },
            {
              group: ["../describe*"],
              message: "Use #describe alias instead of relative imports",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/",
      "**/dist/",
      "coverage/",
      "**/*.d.ts",
      "**/*.config.js",
      "**/*.config.ts",
      "packages/format/src/schemas/yamls.ts",
      "packages/web/.docusaurus/",
      "packages/web/build/",
    ],
  },
);
