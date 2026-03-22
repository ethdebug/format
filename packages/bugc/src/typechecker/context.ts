import { Type, type Types, type Bindings } from "#types";
import type { Visitor } from "#ast";
import type { Declaration } from "./declarations.js";
import { type Symbols } from "./symbols.js";
import { type Error as TypeError } from "./errors.js";

/**
 * Context passed DOWN the tree during type checking.
 * Contains environment information needed to type check a node.
 */
export interface Context {
  /** Symbol table with all visible symbols at this point */
  readonly symbols: Symbols;

  /** All struct type definitions */
  readonly structs: Map<string, Declaration.Struct>;

  /** Return type of the current function (if inside one) */
  readonly currentReturnType?: Type;

  /** Accumulated type information for nodes */
  readonly nodeTypes: Types;

  /** Accumulated bindings from identifiers to declarations */
  readonly bindings: Bindings;

  /** The visitor itself for recursive calls */
  readonly visitor: Visitor<Report, Context>;
}

/**
 * Report passed UP the tree during type checking.
 * Contains results and any updates from checking a subtree.
 */
export interface Report {
  /** The type of this specific node (if it has one) */
  readonly type?: Type;

  /** Updated symbol table (with any new symbols defined) */
  readonly symbols: Symbols;

  /** Updated node type map (with this node's type added) */
  readonly nodeTypes: Types;

  /** Updated bindings map (with new identifier->declaration mappings) */
  readonly bindings: Bindings;

  /** Any type errors found in this subtree */
  readonly errors: readonly TypeError[];
}
