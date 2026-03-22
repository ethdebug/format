import * as Ast from "#ast";
import { Type } from "#types";
import type { Visitor } from "#ast";
import type { Context, Report } from "./context.js";
import { Error as TypeError, ErrorCode, ErrorMessages } from "./errors.js";

/**
 * Type checker for type AST nodes.
 * These nodes appear in declarations and casts.
 * They resolve to Type objects.
 */
export const typeNodeChecker: Pick<Visitor<Report, Context>, "type"> = {
  type(node: Ast.Type, context: Context): Report {
    if (Ast.Type.isElementary(node)) {
      const errors: TypeError[] = [];
      const nodeTypes = new Map(context.nodeTypes);
      let type: Type | undefined;

      // Map elementary types based on kind and bits
      if (Ast.Type.Elementary.isUint(node)) {
        const typeMap: Record<number, Type> = {
          256: Type.Elementary.uint(256),
          128: Type.Elementary.uint(128),
          64: Type.Elementary.uint(64),
          32: Type.Elementary.uint(32),
          16: Type.Elementary.uint(16),
          8: Type.Elementary.uint(8),
        };
        type =
          typeMap[node.bits || 256] ||
          Type.failure(`Unknown uint size: ${node.bits}`);
      } else if (Ast.Type.Elementary.isInt(node)) {
        const typeMap: Record<number, Type> = {
          256: Type.Elementary.int(256),
          128: Type.Elementary.int(128),
          64: Type.Elementary.int(64),
          32: Type.Elementary.int(32),
          16: Type.Elementary.int(16),
          8: Type.Elementary.int(8),
        };
        type =
          typeMap[node.bits || 256] ||
          Type.failure(`Unknown int size: ${node.bits}`);
      } else if (Ast.Type.Elementary.isBytes(node)) {
        if (!node.size) {
          type = Type.Elementary.bytes(); // Dynamic bytes
        } else {
          type = Type.Elementary.bytes(node.size);
        }
      } else if (Ast.Type.Elementary.isAddress(node)) {
        type = Type.Elementary.address();
      } else if (Ast.Type.Elementary.isBool(node)) {
        type = Type.Elementary.bool();
      } else if (Ast.Type.Elementary.isString(node)) {
        type = Type.Elementary.string();
      } else {
        type = Type.failure(`Unknown elementary type: ${node.kind}`);
      }

      if (type) {
        nodeTypes.set(node.id, type);
      }

      return {
        type,
        symbols: context.symbols,
        nodeTypes,
        bindings: context.bindings,
        errors,
      };
    }

    if (Ast.Type.isComplex(node)) {
      const errors: TypeError[] = [];
      let nodeTypes = new Map(context.nodeTypes);
      let symbols = context.symbols;
      let bindings = context.bindings;
      let type: Type | undefined;

      if (Ast.Type.Complex.isArray(node)) {
        // Resolve element type
        const elementContext: Context = {
          ...context,
          nodeTypes,
          symbols,
          bindings,
        };
        const elementResult = Ast.visit(
          context.visitor,
          node.element,
          elementContext,
        );
        nodeTypes = elementResult.nodeTypes;
        symbols = elementResult.symbols;
        bindings = elementResult.bindings;
        errors.push(...elementResult.errors);

        if (elementResult.type) {
          type = Type.array(elementResult.type, node.size);
        }
      } else if (Ast.Type.Complex.isMapping(node)) {
        // Resolve key type
        const keyContext: Context = {
          ...context,
          nodeTypes,
          symbols,
          bindings,
        };
        const keyResult = Ast.visit(context.visitor, node.key, keyContext);
        nodeTypes = keyResult.nodeTypes;
        symbols = keyResult.symbols;
        bindings = keyResult.bindings;
        errors.push(...keyResult.errors);

        // Resolve value type
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

        if (keyResult.type && valueResult.type) {
          type = Type.mapping(keyResult.type, valueResult.type);
        }
      } else {
        type = Type.failure(`Unsupported complex type: ${node.kind}`);
      }

      if (type) {
        nodeTypes.set(node.id, type);
      }

      return {
        type,
        symbols,
        nodeTypes,
        bindings,
        errors,
      };
    }

    const errors: TypeError[] = [];
    const nodeTypes = new Map(context.nodeTypes);
    let type: Type | undefined;

    const structType = context.structs.get(node.name);
    if (!structType) {
      const error = new TypeError(
        ErrorMessages.UNDEFINED_TYPE(node.name),
        node.loc || undefined,
        undefined,
        undefined,
        ErrorCode.UNDEFINED_TYPE,
      );
      errors.push(error);
      type = Type.failure(`Undefined struct: ${node.name}`);
    } else {
      type = structType.type;
    }

    if (type) {
      nodeTypes.set(node.id, type);
    }

    return {
      type,
      symbols: context.symbols,
      nodeTypes,
      bindings: context.bindings,
      errors,
    };
  },
};
