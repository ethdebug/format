/**
 * EVM Code Generation Module
 *
 * A self-contained EVM backend that transforms IR to EVM bytecode with
 * careful stack and memory management. Includes analysis, generation,
 * and operation utilities.
 */

// Main generation entry point

import { Module } from "#evmgen/generation";
export const generateModule = Module.generate;

// Error handling
export { Error, ErrorCode } from "./errors.js";

export * as Analysis from "#evmgen/analysis";
