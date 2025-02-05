import type { Config } from "jest";

const config: Config = {
  displayName: "@ethdebug/pointers",
  preset: "ts-jest",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "js"],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  setupFilesAfterEnv: ["<rootDir>/../../jest.setup.ts"],
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};

export default config;
