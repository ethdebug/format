import * as Ast from "#ast";
import { Type } from "#types";
import type { Visitor } from "#ast";
import type { Context, Report } from "./context.js";
import { Error as TypeError, ErrorCode, ErrorMessages } from "./errors.js";
import { isAssignable } from "./assignable.js";

/**
 * Type checker for statement nodes.
 * Each statement method handles type checking for that statement type
 * and returns an updated report.
 */
export const statementChecker: Pick<Visitor<Report, Context>, "statement"> = {
  statement(node: Ast.Statement, context: Context): Report {
    if (Ast.Statement.isDeclare(node)) {
      // Forward to the declaration visitor method
      return Ast.visit(context.visitor, node.declaration, context);
    }
    if (Ast.Statement.isExpress(node)) {
      // Type check the expression (for side effects)
      const exprContext: Context = {
        ...context,
      };
      return Ast.visit(context.visitor, node.expression, exprContext);
    }

    if (Ast.Statement.isAssign(node)) {
      const errors: TypeError[] = [];
      let nodeTypes = new Map(context.nodeTypes);
      let symbols = context.symbols;
      let bindings = context.bindings;

      if (!Ast.Expression.isAssignable(node.target)) {
        const error = new TypeError(
          "Invalid assignment target",
          node.target.loc || undefined,
          undefined,
          undefined,
          ErrorCode.INVALID_ASSIGNMENT,
        );
        errors.push(error);
        return { symbols, nodeTypes, bindings, errors };
      }

      // Type check target
      const targetContext: Context = {
        ...context,
        nodeTypes,
        symbols,
        bindings,
      };
      const targetResult = Ast.visit(
        context.visitor,
        node.target,
        targetContext,
      );
      nodeTypes = targetResult.nodeTypes;
      symbols = targetResult.symbols;
      bindings = targetResult.bindings;
      errors.push(...targetResult.errors);

      // Type check value
      const valueContext: Context = {
        ...context,
        nodeTypes,
        symbols,
        bindings,
      };
      const valueResult = Ast.visit(context.visitor, node.value, valueContext);
      nodeTypes = valueResult.nodeTypes;
      symbols = valueResult.symbols;
      bindings = valueResult.bindings;
      errors.push(...valueResult.errors);

      // Check type compatibility
      if (
        targetResult.type &&
        valueResult.type &&
        !isAssignable(targetResult.type, valueResult.type)
      ) {
        const error = new TypeError(
          ErrorMessages.TYPE_MISMATCH(
            Type.format(targetResult.type),
            Type.format(valueResult.type),
          ),
          node.loc || undefined,
          Type.format(targetResult.type),
          Type.format(valueResult.type),
          ErrorCode.TYPE_MISMATCH,
        );
        errors.push(error);
      }

      return { symbols, nodeTypes, bindings, errors };
    }

    if (Ast.Statement.isControlFlow(node)) {
      const errors: TypeError[] = [];
      let nodeTypes = new Map(context.nodeTypes);
      let symbols = context.symbols;
      let bindings = context.bindings;

      switch (node.kind) {
        case "statement:control-flow:if": {
          // Type check condition
          if (node.condition) {
            const condContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const condResult = Ast.visit(
              context.visitor,
              node.condition,
              condContext,
            );
            nodeTypes = condResult.nodeTypes;
            symbols = condResult.symbols;
            bindings = condResult.bindings;
            errors.push(...condResult.errors);

            if (condResult.type && !Type.Elementary.isBool(condResult.type)) {
              const error = new TypeError(
                "If condition must be boolean",
                node.condition.loc || undefined,
                undefined,
                undefined,
                ErrorCode.INVALID_CONDITION,
              );
              errors.push(error);
            }
          }

          // Type check body
          if (node.body) {
            const bodyContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const bodyResult = Ast.visit(
              context.visitor,
              node.body,
              bodyContext,
            );
            nodeTypes = bodyResult.nodeTypes;
            symbols = bodyResult.symbols;
            bindings = bodyResult.bindings;
            errors.push(...bodyResult.errors);
          }

          // Type check alternate (else branch)
          if (node.alternate) {
            const altContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const altResult = Ast.visit(
              context.visitor,
              node.alternate,
              altContext,
            );
            nodeTypes = altResult.nodeTypes;
            symbols = altResult.symbols;
            bindings = altResult.bindings;
            errors.push(...altResult.errors);
          }

          return { symbols, nodeTypes, bindings, errors };
        }

        case "statement:control-flow:for": {
          // Enter new scope for loop
          symbols = symbols.enterScope();

          // Type check init
          if (node.init) {
            const initContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const initResult = Ast.visit(
              context.visitor,
              node.init,
              initContext,
            );
            nodeTypes = initResult.nodeTypes;
            symbols = initResult.symbols;
            bindings = initResult.bindings;
            errors.push(...initResult.errors);
          }

          // Type check condition
          if (node.condition) {
            const condContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const condResult = Ast.visit(
              context.visitor,
              node.condition,
              condContext,
            );
            nodeTypes = condResult.nodeTypes;
            symbols = condResult.symbols;
            bindings = condResult.bindings;
            errors.push(...condResult.errors);

            if (condResult.type && !Type.Elementary.isBool(condResult.type)) {
              const error = new TypeError(
                "For condition must be boolean",
                node.condition.loc || undefined,
                undefined,
                undefined,
                ErrorCode.INVALID_CONDITION,
              );
              errors.push(error);
            }
          }

          // Type check update
          if (node.update) {
            const updateContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const updateResult = Ast.visit(
              context.visitor,
              node.update,
              updateContext,
            );
            nodeTypes = updateResult.nodeTypes;
            symbols = updateResult.symbols;
            bindings = updateResult.bindings;
            errors.push(...updateResult.errors);
          }

          // Type check body
          if (node.body) {
            const bodyContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const bodyResult = Ast.visit(
              context.visitor,
              node.body,
              bodyContext,
            );
            nodeTypes = bodyResult.nodeTypes;
            symbols = bodyResult.symbols;
            bindings = bodyResult.bindings;
            errors.push(...bodyResult.errors);
          }

          // Exit scope (don't propagate local symbols)
          symbols = symbols.exitScope();

          return { symbols, nodeTypes, bindings, errors };
        }

        case "statement:control-flow:return": {
          if (node.value) {
            // Type check return value
            const valueContext: Context = {
              ...context,
              nodeTypes,
              symbols,
              bindings,
            };
            const valueResult = Ast.visit(
              context.visitor,
              node.value,
              valueContext,
            );
            nodeTypes = valueResult.nodeTypes;
            symbols = valueResult.symbols;
            bindings = valueResult.bindings;
            errors.push(...valueResult.errors);

            if (valueResult.type && context.currentReturnType) {
              if (!isAssignable(context.currentReturnType, valueResult.type)) {
                const error = new TypeError(
                  ErrorMessages.TYPE_MISMATCH(
                    Type.format(context.currentReturnType),
                    Type.format(valueResult.type),
                  ),
                  node.loc || undefined,
                  Type.format(context.currentReturnType),
                  Type.format(valueResult.type),
                  ErrorCode.TYPE_MISMATCH,
                );
                errors.push(error);
              }
            } else if (valueResult.type && !context.currentReturnType) {
              const error = new TypeError(
                "Cannot return a value from a void function",
                node.loc || undefined,
                undefined,
                undefined,
                ErrorCode.TYPE_MISMATCH,
              );
              errors.push(error);
            }
          } else if (context.currentReturnType) {
            const error = new TypeError(
              `Function must return a value of type ${Type.format(context.currentReturnType)}`,
              node.loc || undefined,
              undefined,
              undefined,
              ErrorCode.TYPE_MISMATCH,
            );
            errors.push(error);
          }

          return { symbols, nodeTypes, bindings, errors };
        }

        case "statement:control-flow:break":
          // No type checking needed for break
          return { symbols, nodeTypes, bindings, errors };

        default:
          // Unknown control flow
          return { symbols, nodeTypes, bindings, errors };
      }
    }

    throw new Error("Unexpected statement");
  },
};
