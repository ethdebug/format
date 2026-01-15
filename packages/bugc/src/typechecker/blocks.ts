import * as Ast from "#ast";
import { Type } from "#types";
import type { Visitor } from "#ast";
import type { Symbol as BugSymbol } from "./symbols.js";
import type { Context, Report } from "./context.js";
import { enterFunctionScope } from "./symbols.js";
import { Error as TypeError, ErrorCode, ErrorMessages } from "./errors.js";
import { resolveTypeWithBindings } from "./declarations.js";
import { isAssignable } from "./assignable.js";

/**
 * Type checker for block-level constructs:
 * - program
 * - blocks
 * - declarations
 */
export const blockChecker: Pick<
  Visitor<Report, Context>,
  "program" | "block" | "declaration"
> = {
  program(node: Ast.Program, context: Context): Report {
    // Note: First two passes (collecting structs/functions and storage)
    // are already done in collectDeclarations() and buildInitialSymbols()
    // We only need to handle the third pass and main body processing

    let currentSymbols = context.symbols;
    let currentNodeTypes = context.nodeTypes;
    let currentBindings = context.bindings;
    const allErrors: TypeError[] = [];

    // Process storage declarations to set their types in nodeTypes
    if (node.storage) {
      for (const storageDecl of node.storage) {
        const declContext: Context = {
          ...context,
          symbols: currentSymbols,
          nodeTypes: currentNodeTypes,
          bindings: currentBindings,
          visitor: context.visitor,
        };
        const declResult = Ast.visit(
          declContext.visitor,
          storageDecl,
          declContext,
        );
        currentNodeTypes = declResult.nodeTypes;
        currentBindings = declResult.bindings;
        allErrors.push(...declResult.errors);
      }
    }

    // Visit all definitions to ensure they get types in nodeTypes map
    if (node.definitions) {
      for (let i = 0; i < node.definitions.items.length; i++) {
        const decl = node.definitions.items[i];
        // Visit function and struct declarations to set their types in nodeTypes
        // and record bindings for type references
        if (
          decl.kind === "declaration:function" ||
          decl.kind === "declaration:struct"
        ) {
          const declContext: Context = {
            ...context,
            symbols: currentSymbols,
            nodeTypes: currentNodeTypes,
            bindings: currentBindings,
            visitor: context.visitor,
          };
          const declResult = Ast.visit(declContext.visitor, decl, declContext);
          currentNodeTypes = declResult.nodeTypes;
          currentBindings = declResult.bindings;
          allErrors.push(...declResult.errors);

          // For structs, also visit their fields to record type reference bindings
          if (decl.kind === "declaration:struct") {
            for (const field of decl.fields) {
              const fieldResult = Ast.visit(declContext.visitor, field, {
                ...declContext,
                bindings: currentBindings,
              });
              currentBindings = fieldResult.bindings;
              allErrors.push(...fieldResult.errors);
            }
          }
        }
      }

      // Third pass: type check function bodies
      for (let i = 0; i < node.definitions.items.length; i++) {
        const decl = node.definitions.items[i];
        if (Ast.Declaration.isFunction(decl)) {
          // Look up the function type
          const funcType = currentSymbols.lookup(decl.name)
            ?.type as Type.Function;
          if (funcType) {
            // Create a new scope with function parameters
            const funcSymbols = enterFunctionScope(
              currentSymbols,
              decl,
              funcType,
            );

            // Create context for function body with return type set
            const funcContext: Context = {
              ...context,
              symbols: funcSymbols,
              currentReturnType: funcType.return || undefined,
              nodeTypes: currentNodeTypes,
              bindings: currentBindings,
              visitor: context.visitor,
            };

            // Type check the function body
            const bodyResult = Ast.visit(
              funcContext.visitor,
              decl.body,
              funcContext,
            );

            // Exit function scope - we don't propagate function-local symbols
            // so we keep currentSymbols unchanged (it still points to the pre-function scope)
            currentNodeTypes = bodyResult.nodeTypes;
            currentBindings = bodyResult.bindings;
            allErrors.push(...bodyResult.errors);
          }
        }
      }
    }

    // Process create block if present
    if (node.create) {
      const createContext: Context = {
        ...context,
        symbols: currentSymbols,
        nodeTypes: currentNodeTypes,
        bindings: currentBindings,
      };
      const createResult = Ast.visit(
        createContext.visitor,
        node.create,
        createContext,
      );
      currentSymbols = createResult.symbols;
      currentNodeTypes = createResult.nodeTypes;
      currentBindings = createResult.bindings;
      allErrors.push(...createResult.errors);
    }

    // Process main code block
    if (node.body) {
      const bodyContext: Context = {
        ...context,
        symbols: currentSymbols,
        nodeTypes: currentNodeTypes,
        bindings: currentBindings,
      };
      const bodyResult = Ast.visit(bodyContext.visitor, node.body, bodyContext);
      currentSymbols = bodyResult.symbols;
      currentNodeTypes = bodyResult.nodeTypes;
      currentBindings = bodyResult.bindings;
      allErrors.push(...bodyResult.errors);
    }

    return {
      symbols: currentSymbols,
      nodeTypes: currentNodeTypes,
      bindings: currentBindings,
      errors: allErrors,
    };
  },

  block(node: Ast.Block, context: Context): Report {
    // Statement blocks need scope management
    if (node.kind === "block:statements") {
      // Enter new scope
      let currentSymbols = context.symbols.enterScope();
      let currentNodeTypes = context.nodeTypes;
      let currentBindings = context.bindings;
      const allErrors: TypeError[] = [];

      // Process each item in the block
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        const itemContext: Context = {
          ...context,
          symbols: currentSymbols,
          nodeTypes: currentNodeTypes,
          bindings: currentBindings,
        };

        const itemResult = Ast.visit(itemContext.visitor, item, itemContext);

        // Thread the results to the next item
        currentSymbols = itemResult.symbols;
        currentNodeTypes = itemResult.nodeTypes;
        currentBindings = itemResult.bindings;
        allErrors.push(...itemResult.errors);
      }

      // Exit scope
      return {
        symbols: currentSymbols.exitScope(),
        nodeTypes: currentNodeTypes,
        bindings: currentBindings,
        errors: allErrors,
      };
    }

    // Definition blocks don't need scope management, just process items
    if (node.kind === "block:definitions") {
      let currentSymbols = context.symbols;
      let currentNodeTypes = context.nodeTypes;
      let currentBindings = context.bindings;
      const allErrors: TypeError[] = [];

      // Process each declaration in the block
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        const itemContext: Context = {
          ...context,
          symbols: currentSymbols,
          nodeTypes: currentNodeTypes,
          bindings: currentBindings,
        };

        const itemResult = Ast.visit(itemContext.visitor, item, itemContext);

        // Thread the results to the next item
        currentSymbols = itemResult.symbols;
        currentNodeTypes = itemResult.nodeTypes;
        currentBindings = itemResult.bindings;
        allErrors.push(...itemResult.errors);
      }

      return {
        symbols: currentSymbols,
        nodeTypes: currentNodeTypes,
        bindings: currentBindings,
        errors: allErrors,
      };
    }

    // Should not reach here, but return unchanged if we do
    return {
      symbols: context.symbols,
      nodeTypes: context.nodeTypes,
      bindings: context.bindings,
      errors: [],
    };
  },

  declaration(node: Ast.Declaration, context: Context): Report {
    const errors: TypeError[] = [];
    let nodeTypes = new Map(context.nodeTypes);
    let symbols = context.symbols;
    let bindings = context.bindings;

    switch (node.kind) {
      case "declaration:struct":
        // Already processed in collectDeclarations phase
        return { symbols, nodeTypes, bindings, errors };

      case "declaration:function": {
        // Function declarations are already in the symbol table from buildInitialSymbols
        // We just need to set the type on the node and record any type reference bindings
        const symbol = symbols.lookup(node.name);
        if (symbol) {
          nodeTypes.set(node.id, symbol.type);
        }

        // Process parameter types to record bindings for type references
        for (const param of node.parameters) {
          if (param.type) {
            const typeResult = resolveTypeWithBindings(
              param.type,
              context.structs,
              bindings,
            );
            bindings = typeResult.bindings;
          }
        }

        // Process return type to record bindings for type references
        if (node.returnType) {
          const typeResult = resolveTypeWithBindings(
            node.returnType,
            context.structs,
            bindings,
          );
          bindings = typeResult.bindings;
        }

        return { type: symbol?.type, symbols, nodeTypes, bindings, errors };
      }

      case "declaration:storage": {
        // Storage declarations are already in the symbol table from buildInitialSymbols
        // We just need to set the type on the node and record any type reference bindings
        const symbol = symbols.lookup(node.name);
        if (symbol) {
          nodeTypes.set(node.id, symbol.type);
        }

        // Also process the type node to record bindings for type references
        if (node.type) {
          const typeResult = resolveTypeWithBindings(
            node.type,
            context.structs,
            bindings,
          );
          bindings = typeResult.bindings;
        }

        return { type: symbol?.type, symbols, nodeTypes, bindings, errors };
      }

      case "declaration:variable": {
        if (!node.initializer) {
          const error = new TypeError(
            `Variable ${node.name} must have an initializer`,
            node.loc || undefined,
            undefined,
            undefined,
            ErrorCode.MISSING_INITIALIZER,
          );
          errors.push(error);

          // Still define the variable with error type
          const errorType = Type.failure("missing initializer");
          const symbol: BugSymbol = {
            name: node.name,
            type: errorType,
            mutable: true,
            location: "memory",
            declaration: node,
          };
          symbols = symbols.define(symbol);
          nodeTypes.set(node.id, errorType);
          return { type: errorType, symbols, nodeTypes, bindings, errors };
        }

        // Type check the initializer
        const initContext: Context = {
          ...context,
          nodeTypes,
          bindings,
        };
        const initResult = Ast.visit(
          initContext.visitor,
          node.initializer,
          initContext,
        );
        nodeTypes = initResult.nodeTypes;
        bindings = initResult.bindings;
        errors.push(...initResult.errors);

        // Determine the variable's type
        let type: Type;
        if (node.type) {
          // If a type is explicitly declared, use it and record bindings
          const typeResult = resolveTypeWithBindings(
            node.type,
            context.structs,
            bindings,
          );
          type = typeResult.type;
          bindings = typeResult.bindings;

          // Check that the initializer is compatible with the declared type
          if (initResult.type && !isAssignable(type, initResult.type)) {
            const error = new TypeError(
              ErrorMessages.TYPE_MISMATCH(
                Type.format(type),
                Type.format(initResult.type),
              ),
              node.initializer.loc || undefined,
              Type.format(type),
              Type.format(initResult.type),
              ErrorCode.TYPE_MISMATCH,
            );
            errors.push(error);
          }
        } else {
          // Otherwise, infer the type from the initializer
          type = initResult.type || Type.failure("invalid initializer");
        }

        const symbol: BugSymbol = {
          name: node.name,
          type,
          mutable: true,
          location: "memory",
          declaration: node,
        };
        symbols = symbols.define(symbol);
        nodeTypes.set(node.id, type);
        return { type, symbols, nodeTypes, bindings, errors };
      }

      case "declaration:field":
        // Fields are handled as part of struct processing,
        // but we still need to record bindings for type references
        if (node.type) {
          const typeResult = resolveTypeWithBindings(
            node.type,
            context.structs,
            bindings,
          );
          bindings = typeResult.bindings;
        }
        return { symbols, nodeTypes, bindings, errors };

      default:
        return { symbols, nodeTypes, bindings, errors };
    }
  },
};
