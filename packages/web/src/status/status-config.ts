/**
 * Centralized configuration for schema status information.
 *
 * This is the single source of truth for maturity levels, caveats, and
 * status details across the ethdebug/format specification.
 */

export type StatusLevel =
  | "in-design"
  | "implementable"
  | "reference-available";

export interface StatusLevelInfo {
  label: string;
  color: string;
  description: string;
  adoptersNote: string;
}

export const statusLevels: Record<StatusLevel, StatusLevelInfo> = {
  "in-design": {
    label: "In Design",
    color: "#6366f1", // Indigo
    description:
      "Actively being developed. Expect significant changes to structure " +
      "and semantics.",
    adoptersNote:
      "Early feedback welcome, but implementations should expect breaking " +
      "changes.",
  },
  "implementable": {
    label: "Implementable",
    color: "#d97706", // Amber
    description:
      "Stable enough to build against. Minor changes possible but core " +
      "design is settled.",
    adoptersNote:
      "Tooling can implement against this schema with reasonable confidence.",
  },
  "reference-available": {
    label: "Reference Available",
    color: "#059669", // Green
    description:
      "Stable schema with a working reference implementation available " +
      "(debugger-side and/or compiler-side).",
    adoptersNote:
      "Reference implementation demonstrates correct behavior. Check details " +
      "for which side (debugger/compiler) has implementations.",
  },
};

export interface SchemaStatusInfo {
  level: StatusLevel;
  summary: string;
  caveats: string[];
  detailsPath: string;
  referenceUrl?: string;
}

export const schemaStatus: Record<string, SchemaStatusInfo> = {
  pointer: {
    level: "reference-available",
    summary:
      "Comprehensive schema for describing data locations in EVM state. " +
      "Debugger-side reference implementation available in @ethdebug/pointers.",
    caveats: [
      "Pointer templates cannot rename their output region names, limiting " +
      "composability for complex scenarios.",
      "No compiler-side reference implementation yet.",
    ],
    detailsPath: "/spec/pointer/overview#status",
    referenceUrl: "/docs/implementation-guides/pointers",
  },
  type: {
    level: "implementable",
    summary:
      "Complete coverage of Solidity types (elementary and complex).",
    caveats: [
      "No support for generic types (e.g., parameterized types).",
    ],
    detailsPath: "/spec/type/overview#status",
  },
  program: {
    level: "in-design",
    summary:
      "Schema for describing high-level program structure and instruction " +
      "contexts. Core structure is foundational, but context system is " +
      "actively evolving.",
    caveats: [
      "Context types for function calls, returns, and reverts are still " +
      "being designed.",
      "Broader structural changes may occur to accommodate new concerns.",
    ],
    detailsPath: "/spec/program/overview#status",
  },
  data: {
    level: "implementable",
    summary:
      "Foundational schemas for common data representations (hex strings, " +
      "unsigned integers, values).",
    caveats: [],
    detailsPath: "/spec/data/overview#status",
  },
  materials: {
    level: "implementable",
    summary:
      "Schemas for compilation metadata, source files, and source ranges.",
    caveats: [],
    detailsPath: "/spec/materials/overview#status",
  },
  info: {
    level: "implementable",
    summary:
      "Intentionally minimal schema for representing compilation-related " +
      "debug information.",
    caveats: [],
    detailsPath: "/spec/info/overview#status",
  },
};

/**
 * Get the overall project status level (the lowest maturity across all
 * primary schemas).
 */
export function getOverallStatus(): StatusLevel {
  const primarySchemas = ["pointer", "type", "program"];
  const levels: StatusLevel[] = primarySchemas.map(
    (key) => schemaStatus[key].level
  );

  // Return the least mature level
  if (levels.includes("in-design")) {
    return "in-design";
  }
  if (levels.includes("implementable")) {
    return "implementable";
  }
  return "reference-available";
}
