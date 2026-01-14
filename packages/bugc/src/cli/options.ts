import type { ParseArgsConfig } from "util";

export const commonOptions: ParseArgsConfig["options"] = {
  help: {
    type: "boolean",
    short: "h",
    default: false,
  },
  output: {
    type: "string",
    short: "o",
  },
};

export const optimizationOption: ParseArgsConfig["options"] = {
  optimize: {
    type: "string",
    short: "O",
    default: "0",
  },
};

export const prettyOption: ParseArgsConfig["options"] = {
  pretty: {
    type: "boolean",
    short: "p",
    default: false,
  },
};

export function parseOptimizationLevel(value: string): number {
  const level = parseInt(value, 10);
  if (isNaN(level) || level < 0 || level > 3) {
    throw new Error(
      `Invalid optimization level: ${value}. Must be 0, 1, 2, or 3.`,
    );
  }
  return level;
}
