import type * as Ast from "#ast";
import { Analysis as AstAnalysis } from "#ast";
import { Type, type Types, type Bindings } from "#types/spec";

export class Formatter {
  private output: string[] = [];
  private indent = 0;
  private source?: string;

  format(types: Types, bindings: Bindings, source?: string): string {
    this.output = [];
    this.indent = 0;
    this.source = source;

    this.line("=== Type Information ===");
    this.line("");

    // Group types by their AST node kind
    const groupedTypes = this.groupByNodeKind(types);

    // Format each group
    for (const [kind, entries] of groupedTypes) {
      this.formatGroup(kind, entries);
    }

    // Format bindings
    if (bindings.size > 0) {
      this.line("=== Bindings Information ===");
      this.line("");
      this.formatBindings(bindings);
    }

    return this.output.join("\n");
  }

  private groupByNodeKind(types: Types): Map<string, Array<[Ast.Id, Type]>> {
    const groups = new Map<string, Array<[Ast.Id, Type]>>();

    for (const [id, type] of types) {
      const kind = this.getNodeKind(id);
      if (!groups.has(kind)) {
        groups.set(kind, []);
      }
      groups.get(kind)!.push([id, type]);
    }

    // Sort groups for consistent output
    return new Map(
      [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  private getNodeKind(_id: Ast.Id): string {
    // Extract the node kind from the ID
    // IDs are numeric with underscore separator like "31_1"
    // For now, group all as "TypedExpressions"
    return "TypedExpressions";
  }

  private formatGroup(kind: string, entries: Array<[Ast.Id, Type]>) {
    this.line(`${kind}:`);
    this.indent++;

    // Sort entries by their position in the source
    const sortedEntries = [...entries].sort(([a], [b]) => {
      const posA = this.extractPosition(a);
      const posB = this.extractPosition(b);
      if (posA.line !== posB.line) {
        return posA.line - posB.line;
      }
      return posA.col - posB.col;
    });

    for (const [id, type] of sortedEntries) {
      this.formatEntry(id, type);
    }

    this.indent--;
    this.line("");
  }

  private extractPosition(id: Ast.Id): { line: number; col: number } {
    // IDs are in format like "31_1" (byteOffset_length)
    const parts = id.split("_");
    const byteOffset = parseInt(parts[0] || "0", 10);

    // Convert byte offset to line/column if we have source
    if (this.source) {
      const { line, col } = AstAnalysis.offsetToLineCol(
        this.source,
        byteOffset,
      );
      return { line, col };
    }

    // Fallback: just use byte offset as line for sorting
    return { line: byteOffset, col: 0 };
  }

  private formatEntry(id: Ast.Id, type: Type) {
    // IDs are in format like "offset_length"
    const parts = id.split("_");
    const offset = parseInt(parts[0] || "0", 10);
    const length = parseInt(parts[1] || "0", 10);

    let position: string;
    if (this.source) {
      const start = AstAnalysis.offsetToLineCol(this.source, offset);
      const end = AstAnalysis.offsetToLineCol(this.source, offset + length);

      if (start.line === end.line) {
        // Same line: show as line:col1-col2
        position = `${start.line}:${start.col}-${end.col}`;
      } else {
        // Multiple lines: show full range
        position = `${start.line}:${start.col}-${end.line}:${end.col}`;
      }
    } else {
      position = `offset ${offset}, length ${length}`;
    }

    // Format the type using the built-in formatter
    const typeStr = Type.format(type);

    // Build the entry line
    const entry = `${position}: ${typeStr}`;

    // Add additional details for complex types
    if (Type.isStruct(type)) {
      this.line(entry);
      this.indent++;
      this.formatStructDetails(type);
      this.indent--;
    } else if (Type.isFunction(type)) {
      this.line(entry);
      this.indent++;
      this.formatFunctionDetails(type);
      this.indent--;
    } else if (Type.isArray(type)) {
      this.line(entry);
      this.indent++;
      this.formatArrayDetails(type);
      this.indent--;
    } else if (Type.isMapping(type)) {
      this.line(entry);
      this.indent++;
      this.formatMappingDetails(type);
      this.indent--;
    } else {
      this.line(entry);
    }
  }

  private formatStructDetails(struct: Type.Struct) {
    this.line("fields:");
    this.indent++;
    for (const [fieldName, fieldType] of struct.fields) {
      const layout = struct.layout.get(fieldName);
      const layoutStr = layout
        ? ` [offset: ${layout.byteOffset}, size: ${layout.size}]`
        : "";
      this.line(`${fieldName}: ${Type.format(fieldType)}${layoutStr}`);
    }
    this.indent--;
  }

  private formatFunctionDetails(func: Type.Function) {
    if (func.parameters.length > 0) {
      this.line("parameters:");
      this.indent++;
      func.parameters.forEach((param, index) => {
        this.line(`[${index}]: ${Type.format(param)}`);
      });
      this.indent--;
    }

    if (func.return !== null) {
      this.line(`returns: ${Type.format(func.return)}`);
    } else {
      this.line("returns: void");
    }
  }

  private formatArrayDetails(array: Type.Array) {
    this.line(`element type: ${Type.format(array.element)}`);
    if (array.size !== undefined) {
      this.line(`size: ${array.size}`);
    } else {
      this.line("size: dynamic");
    }
  }

  private formatMappingDetails(mapping: Type.Mapping) {
    this.line(`key type: ${Type.format(mapping.key)}`);
    this.line(`value type: ${Type.format(mapping.value)}`);
  }

  private line(text: string) {
    const indentStr = "  ".repeat(this.indent);
    this.output.push(indentStr + text);
  }

  private formatBindings(bindings: Bindings) {
    // Group bindings by declaration
    const byDeclaration = new Map<Ast.Declaration, Ast.Id[]>();
    for (const [id, decl] of bindings) {
      if (!byDeclaration.has(decl)) {
        byDeclaration.set(decl, []);
      }
      byDeclaration.get(decl)!.push(id);
    }

    // Sort declarations by their position
    const sortedDeclarations = [...byDeclaration.entries()].sort(
      ([declA], [declB]) => {
        const posA = this.extractPosition(declA.id);
        const posB = this.extractPosition(declB.id);
        if (posA.line !== posB.line) {
          return posA.line - posB.line;
        }
        return posA.col - posB.col;
      },
    );

    this.line("Identifier Bindings:");
    this.indent++;

    for (const [decl, identifierIds] of sortedDeclarations) {
      // Format the declaration location and type
      const declPos = this.formatPosition(decl.id);
      const declType = this.getDeclarationType(decl);
      const declName = this.getDeclarationName(decl);

      this.line(`${declType} "${declName}" at ${declPos}:`);
      this.indent++;

      // Sort and format all references to this declaration
      const sortedIds = identifierIds.sort((a, b) => {
        const posA = this.extractPosition(a);
        const posB = this.extractPosition(b);
        if (posA.line !== posB.line) {
          return posA.line - posB.line;
        }
        return posA.col - posB.col;
      });

      for (const id of sortedIds) {
        const refPos = this.formatPosition(id);
        this.line(`referenced at ${refPos}`);
      }

      this.indent--;
    }

    this.indent--;
  }

  private formatPosition(id: Ast.Id): string {
    const parts = id.split("_");
    const offset = parseInt(parts[0] || "0", 10);
    const length = parseInt(parts[1] || "0", 10);

    if (this.source) {
      const start = AstAnalysis.offsetToLineCol(this.source, offset);
      const end = AstAnalysis.offsetToLineCol(this.source, offset + length);

      if (start.line === end.line) {
        return `${start.line}:${start.col}-${end.col}`;
      } else {
        return `${start.line}:${start.col}-${end.line}:${end.col}`;
      }
    } else {
      return `offset ${offset}, length ${length}`;
    }
  }

  private getDeclarationType(decl: Ast.Declaration): string {
    switch (decl.kind) {
      case "declaration:variable":
        return "Variable";
      case "declaration:function":
        return "Function";
      case "declaration:storage":
        return "Storage";
      case "declaration:struct":
        return "Struct";
      case "declaration:field":
        return "Field";
      default:
        return "Declaration";
    }
  }

  private getDeclarationName(decl: Ast.Declaration): string {
    if ("name" in decl && typeof decl.name === "string") {
      return decl.name;
    }
    return "<unnamed>";
  }
}
