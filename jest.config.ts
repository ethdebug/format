import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  rootDir: "./",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  projects: ["<rootDir>/packages/*"],
};

export default config;
