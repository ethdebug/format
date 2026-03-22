import * as Ast from "#ast";
import { Type } from "#types";
import { Result } from "#result";
import { resolveType, type Declarations } from "./declarations.js";
import { Error as TypeError } from "./errors.js";

/**
 * Immutable symbol table for functional typechecking.
 * Each operation returns a new table rather than mutating.
 */
export class Symbols {
  constructor(
    private readonly scopes: readonly Map<string, BugSymbol>[] = [new Map()],
  ) {}

  static empty(): Symbols {
    return new Symbols();
  }

  enterScope(): Symbols {
    return new Symbols([...this.scopes, new Map()]);
  }

  exitScope(): Symbols {
    if (this.scopes.length <= 1) {
      return this;
    }
    return new Symbols(this.scopes.slice(0, -1));
  }

  define(symbol: BugSymbol): Symbols {
    const newScopes = [...this.scopes];
    const lastScope = new Map(newScopes[newScopes.length - 1]);
    lastScope.set(symbol.name, symbol);
    newScopes[newScopes.length - 1] = lastScope;
    return new Symbols(newScopes);
  }

  lookup(name: string): BugSymbol | undefined {
    // Search from innermost to outermost scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const symbol = this.scopes[i].get(name);
      if (symbol) {
        return symbol;
      }
    }
    return undefined;
  }

  isDefined(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  isDefinedInCurrentScope(name: string): boolean {
    const currentScope = this.scopes[this.scopes.length - 1];
    return currentScope.has(name);
  }
}

// Symbol table entry
interface BugSymbol {
  name: string;
  type: Type;
  mutable: boolean;
  location: "storage" | "memory" | "builtin";
  slot?: number; // For storage variables
  declaration: Ast.Declaration;
}

export { type BugSymbol as Symbol };

/**
 * Builds the initial symbol table from declarations without traversing expressions.
 * This includes:
 * - Function names in global scope
 * - Storage variables in global scope
 *
 * Note: Function parameters and local variables are added during type checking
 * when we actually traverse function bodies.
 */
export function buildInitialSymbols(
  program: Ast.Program,
  { functions, structs }: Declarations,
): Result<Symbols, TypeError> {
  let symbols = Symbols.empty();
  const errors: TypeError[] = [];

  // Add all function signatures to global scope
  for (const [name, function_] of functions) {
    const symbol: BugSymbol = {
      name,
      type: function_.type,
      mutable: false,
      location: "memory",
      declaration: function_.node,
    };

    symbols = symbols.define(symbol);
  }

  // Add all storage variables to global scope
  for (const decl of program.storage || []) {
    const type = decl.type
      ? resolveType(decl.type, structs)
      : Type.failure("missing type");

    const symbol: BugSymbol = {
      name: decl.name,
      type,
      mutable: true,
      location: "storage",
      slot: decl.slot,
      declaration: decl,
    };

    symbols = symbols.define(symbol);
  }

  if (errors.length > 0) {
    return Result.err(errors);
  }
  return Result.ok(symbols);
}

/**
 * Creates a new symbol table scope with function parameters.
 * Used when entering a function body during type checking.
 */
export function enterFunctionScope(
  symbols: Symbols,
  funcDecl: Ast.Declaration.Function,
  funcType: Type.Function,
): Symbols {
  let newSymbols = symbols.enterScope();

  // Add parameters to the function scope
  const parameters = funcDecl.parameters;
  for (let i = 0; i < parameters.length; i++) {
    const param = parameters[i];
    const symbol: BugSymbol = {
      name: param.name,
      type: funcType.parameters[i],
      mutable: true,
      location: "memory",
      declaration: param,
    };
    newSymbols = newSymbols.define(symbol);
  }

  return newSymbols;
}
