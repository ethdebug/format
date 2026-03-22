/**
 * IR formatter for human-readable text output
 */

import * as Format from "@ethdebug/format";

import * as Ir from "#ir/spec";
import { Analysis as AstAnalysis } from "#ast";

export class Formatter {
  private indent = 0;
  private output: string[] = [];
  private commentedValues: Set<string> = new Set();
  private source?: string;

  format(module: Ir.Module, source?: string): string {
    this.output = [];
    this.indent = 0;
    this.source = source;

    // Module declaration with name (no quotes)
    this.line(`module ${module.name} {`);
    this.indent++;

    // Format create function first if present
    if (module.create) {
      this.line("@create");
      this.formatFunction(module.create);
      this.line("");
    }

    // Format main function next
    this.line("@main");
    this.formatFunction(module.main);

    // Format user-defined functions last
    if (module.functions && module.functions.size > 0) {
      this.line("");
      for (const func of module.functions.values()) {
        this.formatFunction(func);
        this.line("");
      }
    }

    this.indent--;
    this.line("}");

    return this.output.join("\n");
  }

  private formatFunction(func: Ir.Function): void {
    // Format function signature with parameters
    const params: string[] = [];
    for (const param of func.parameters) {
      params.push(`^${param.tempId}: ${this.formatType(param.type)}`);
    }
    this.line(`function ${func.name}(${params.join(", ")}) {`);
    this.indent++;

    // Get blocks in topological order
    const sortedBlocks = this.topologicalSort(func);

    // Format each block
    for (const blockId of sortedBlocks) {
      const block = func.blocks.get(blockId);
      if (!block) continue; // Skip blocks that don't exist
      this.formatBlock(blockId, block);
    }

    this.indent--;
    this.line("}");
  }

  private formatBlock(id: string, block: Ir.Block): void {
    // Reset commented values for each block
    this.commentedValues = new Set();

    // Block header - only show predecessors for merge points (multiple preds)
    // or if block has phi nodes (which indicates it's a merge point)
    const showPreds =
      block.predecessors?.size > 1 || (block.phis && block.phis.length > 0);
    const predsStr =
      showPreds && block.predecessors?.size > 0
        ? ` preds=[${Array.from(block.predecessors).sort().join(", ")}]`
        : "";
    this.line(`${id}${predsStr}:`);
    this.indent++;

    // Phi nodes
    if (block.phis && block.phis.length > 0) {
      for (const phi of block.phis) {
        const phiSourceComment = this.formatSourceComment(phi.operationDebug);
        if (phiSourceComment) {
          // Handle multi-line comments for pick contexts
          for (const line of phiSourceComment.split("\n")) {
            this.line(line);
          }
        }
        this.line(this.formatPhiInstruction(phi));
      }
    }

    // Instructions
    for (const inst of block.instructions) {
      const sourceComment = this.formatSourceComment(inst.operationDebug);
      if (sourceComment) {
        // Handle multi-line comments for pick contexts
        for (const line of sourceComment.split("\n")) {
          this.line(line);
        }
      }
      this.line(this.formatInstruction(inst));
    }

    // Terminator
    const terminatorSourceComment = this.formatSourceComment(
      block.terminator.operationDebug,
    );
    if (terminatorSourceComment) {
      // Handle multi-line comments for pick contexts
      for (const line of terminatorSourceComment.split("\n")) {
        this.line(line);
      }
    }
    this.line(this.formatTerminator(block.terminator));

    this.indent--;
    this.line("");
  }

  private formatPhiInstruction(inst: Ir.Block.Phi): string {
    const sources: string[] = [];
    for (const [block, value] of inst.sources) {
      sources.push(`[${block}: ${this.formatValue(value)}]`);
    }
    // Add appropriate prefix for destinations in phi nodes
    const dest = inst.dest.startsWith("t") ? `%${inst.dest}` : `^${inst.dest}`;
    const typeStr = inst.type ? `: ${this.formatType(inst.type)}` : "";
    return `${dest}${typeStr} = phi ${sources.join(", ")}`;
  }
  private formatInstruction(inst: Ir.Instruction): string {
    // Helper to add type annotation to dest
    const destWithType = (dest: string, type?: Ir.Type): string => {
      // Add appropriate prefix for destinations
      const formattedDest = dest.startsWith("t") ? `%${dest}` : `^${dest}`;
      return type
        ? `${formattedDest}: ${this.formatType(type)}`
        : formattedDest;
    };

    switch (inst.kind) {
      case "const":
        return `${destWithType(inst.dest, inst.type)} = const ${this.formatConstValue(inst.value, inst.type)}`;

      case "allocate":
        return `${destWithType(inst.dest, Ir.Type.Scalar.uint256)} = allocate.${inst.location}, size=${this.formatValue(inst.size)}`;

      case "binary":
        return `${destWithType(inst.dest)} = ${inst.op} ${this.formatValue(inst.left)}, ${this.formatValue(inst.right)}`;

      case "unary":
        return `${destWithType(inst.dest)} = ${inst.op} ${this.formatValue(inst.operand)}`;

      case "env":
        return `${destWithType(inst.dest)} = env ${inst.op}`;

      case "hash":
        return `${destWithType(inst.dest)} = hash ${this.formatValue(inst.value)}`;

      case "cast":
        return `${destWithType(inst.dest, inst.targetType)} = cast ${this.formatValue(inst.value)} to ${this.formatType(inst.targetType)}`;

      case "compute_slot": {
        const base = this.formatValue(inst.base);
        let slotExpr: string;

        if (Ir.Instruction.ComputeSlot.isMapping(inst)) {
          const key = this.formatValue(inst.key);
          slotExpr = `slot[${base}].mapping[${key}]`;
        } else if (Ir.Instruction.ComputeSlot.isArray(inst)) {
          // Array compute_slot computes the first slot of the array
          slotExpr = `slot[${base}].array`;
        } else if (Ir.Instruction.ComputeSlot.isField(inst)) {
          // Just show the offset, no field name
          slotExpr = `slot[${base}].field[${inst.fieldOffset}]`;
        } else {
          // Shouldn't happen with proper typing
          slotExpr = `slot[${base}]`;
        }

        return `${destWithType(inst.dest, Ir.Type.Scalar.uint256)} = ${slotExpr}`;
      }

      // Call instruction removed - calls are now block terminators

      case "length":
        return `${destWithType(inst.dest)} = length ${this.formatValue(inst.object)}`;

      // NEW: unified read instruction
      case "read": {
        const location = inst.location;

        // Check if we're using defaults
        const isDefaultOffset =
          !inst.offset ||
          (inst.offset.kind === "const" && inst.offset.value === 0n);
        const isDefaultLength =
          !inst.length ||
          (inst.length.kind === "const" && inst.length.value === 32n);

        let locationStr: string;
        if (location === "storage" || location === "transient") {
          // For storage/transient, slot is required
          const slot = inst.slot ? this.formatValue(inst.slot) : "0";

          if (isDefaultOffset && isDefaultLength) {
            // Only slot - compact syntax with * to indicate word-sized operation
            locationStr = `${location}[${slot}*]`;
          } else {
            // Multiple fields - use named syntax
            const parts: string[] = [`slot: ${slot}`];
            if (!isDefaultOffset && inst.offset) {
              parts.push(`offset: ${this.formatValue(inst.offset)}`);
            }
            if (!isDefaultLength && inst.length) {
              parts.push(`length: ${this.formatValue(inst.length)}`);
            }
            locationStr = `${location}[${parts.join(", ")}]`;
          }
        } else {
          // For memory/calldata/returndata
          if (inst.offset) {
            const offset = this.formatValue(inst.offset);
            if (isDefaultLength) {
              // Only offset - compact syntax with * to indicate word-sized operation
              locationStr = `${location}[${offset}*]`;
            } else {
              // Multiple fields - use named syntax
              const length = inst.length ? this.formatValue(inst.length) : "32";
              locationStr = `${location}[offset: ${offset}, length: ${length}]`;
            }
          } else {
            // No offset specified
            locationStr = `${location}[]`;
          }
        }

        return `${destWithType(inst.dest, inst.type)} = ${locationStr}`;
      }

      // NEW: unified write instruction
      case "write": {
        const location = inst.location;
        const value = this.formatValue(inst.value);

        // Check if we're using defaults
        const isDefaultOffset =
          !inst.offset ||
          (inst.offset.kind === "const" && inst.offset.value === 0n);
        const isDefaultLength =
          !inst.length ||
          (inst.length.kind === "const" && inst.length.value === 32n);

        if (location === "storage" || location === "transient") {
          // For storage/transient, slot is required
          const slot = inst.slot ? this.formatValue(inst.slot) : "0";

          if (isDefaultOffset && isDefaultLength) {
            // Only slot - compact syntax with * to indicate word-sized operation
            return `${location}[${slot}*] = ${value}`;
          } else {
            // Multiple fields - use named syntax
            const parts: string[] = [`slot: ${slot}`];
            if (!isDefaultOffset && inst.offset) {
              parts.push(`offset: ${this.formatValue(inst.offset)}`);
            }
            if (!isDefaultLength && inst.length) {
              parts.push(`length: ${this.formatValue(inst.length)}`);
            }
            return `${location}[${parts.join(", ")}] = ${value}`;
          }
        } else {
          // For memory/calldata/returndata
          if (inst.offset) {
            const offset = this.formatValue(inst.offset);
            if (isDefaultLength) {
              // Only offset - compact syntax with * to indicate word-sized operation
              return `${location}[${offset}*] = ${value}`;
            } else {
              // Multiple fields - use named syntax
              const length = inst.length ? this.formatValue(inst.length) : "32";
              return `${location}[offset: ${offset}, length: ${length}] = ${value}`;
            }
          } else {
            // No offset specified
            return `${location}[] = ${value}`;
          }
        }
      }

      // NEW: unified compute offset
      case "compute_offset": {
        const base = this.formatValue(inst.base);
        let offsetExpr: string;

        if (Ir.Instruction.ComputeOffset.isArray(inst)) {
          const index = this.formatValue(inst.index);
          if (inst.stride === 32) {
            // Default stride - single param syntax
            offsetExpr = `offset[${base}].array[${index}]`;
          } else {
            // Non-default stride - named syntax
            offsetExpr = `offset[${base}].array[index: ${index}, stride: ${inst.stride}]`;
          }
        } else if (Ir.Instruction.ComputeOffset.isField(inst)) {
          // Field just shows the offset
          offsetExpr = `offset[${base}].field[${inst.fieldOffset}]`;
        } else if (Ir.Instruction.ComputeOffset.isByte(inst)) {
          const offset = this.formatValue(inst.offset);
          offsetExpr = `offset[${base}].byte[${offset}]`;
        } else {
          // Shouldn't happen with proper typing
          offsetExpr = `offset[${base}]`;
        }

        // Add % prefix for temp destinations
        const dest = inst.dest.startsWith("t") ? `%${inst.dest}` : inst.dest;
        return `${dest} = ${offsetExpr}`;
      }

      default:
        return `; unknown instruction: ${(inst as unknown as { kind: string }).kind}`;
    }
  }

  private formatTerminator(term: Ir.Block.Terminator): string {
    switch (term.kind) {
      case "jump":
        return `jump ${term.target}`;

      case "branch":
        return `branch ${this.formatValue(term.condition)} ? ${term.trueTarget} : ${term.falseTarget}`;

      case "return":
        return term.value
          ? `return ${this.formatValue(term.value)}`
          : "return void";

      case "call": {
        const args = term.arguments
          .map((arg) => this.formatValue(arg))
          .join(", ");
        const callPart = term.dest
          ? `${term.dest} = call ${term.function}(${args})`
          : `call ${term.function}(${args})`;
        return `${callPart} -> ${term.continuation}`;
      }

      default:
        return `; unknown terminator: ${(term as unknown as { kind: string }).kind}`;
    }
  }

  private formatValue(
    value: Ir.Value | bigint | string | boolean,
    includeType: boolean = false,
  ): string {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "string") {
      // If it's a hex string (starts with 0x), return without quotes
      if (value.startsWith("0x")) {
        return value;
      }
      return JSON.stringify(value);
    }
    if (typeof value === "boolean") {
      return value.toString();
    }

    const baseFormat = (() => {
      switch (value.kind) {
        case "const":
          // Pass type information to formatConstValue for proper hex formatting
          return this.formatConstValue(value.value, value.type);
        case "temp":
          return `%${value.id}`; // Add % prefix for temps for clarity
        default:
          return "?";
      }
    })();

    // Only add type information if requested (to avoid redundancy)
    if (includeType && value.type) {
      const typeStr = this.formatType(value.type);
      return `${baseFormat}: ${typeStr}`;
    }
    return baseFormat;
  }

  private formatConstValue(
    value: bigint | string | boolean,
    type?: Ir.Type,
  ): string {
    if (typeof value === "bigint") {
      // If we have type information and it's a bytes type, format as hex
      if (type && type.kind === "scalar" && type.size <= 32) {
        // Convert to hex string with 0x prefix
        const hex = value.toString(16);
        // Pad to even number of characters (2 per byte)
        const padded = hex.length % 2 === 0 ? hex : "0" + hex;
        const hexStr = `0x${padded}`;

        // Add decimal comment for meaningful values (not tiny single-digit values)
        const shouldAddComment =
          value >= 10n &&
          // Small values (less than 4 bytes)
          (value <= 0xffffffffn ||
            // Common round numbers
            value % 10000n === 0n ||
            // Powers of 10
            value === 10n ||
            value === 100n ||
            value === 1000n ||
            value === 10000n ||
            value === 100000n ||
            value === 1000000n ||
            // Powers of 2 up to 2^16
            ((value & (value - 1n)) === 0n && value <= 65536n));

        if (shouldAddComment) {
          // Check if we've already commented this value in this block
          const valueKey = value.toString();
          if (!this.commentedValues.has(valueKey)) {
            this.commentedValues.add(valueKey);
            return `${hexStr} /* ${value} */`;
          }
        }
        return hexStr;
      }
      return value.toString();
    }
    if (typeof value === "string") {
      // If it's already a hex string (starts with 0x), return without quotes
      if (value.startsWith("0x")) {
        return value;
      }
      // Otherwise, use JSON.stringify for proper escaping
      return JSON.stringify(value);
    }
    return value.toString();
  }

  private formatType(type: Ir.Type): string {
    switch (type.kind) {
      case "scalar":
        // Format scalar types based on size and origin
        if (type.origin === "synthetic") {
          return `scalar${type.size}`;
        }
        // Common scalar sizes
        if (type.size === 32) return "uint256";
        if (type.size === 20) return "address";
        if (type.size === 1) return "bool";
        return `bytes${type.size}`;
      case "ref":
        // Format reference types based on location
        return `ref<${type.location}>`;
      default:
        return "unknown";
    }
  }

  private line(text: string): void {
    const indentStr = "  ".repeat(this.indent);
    this.output.push(indentStr + text);
  }

  private topologicalSort(func: Ir.Function): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (blockId: string): void => {
      if (visited.has(blockId)) return;
      visited.add(blockId);

      // Add current block first (pre-order)
      result.push(blockId);

      const block = func.blocks.get(blockId);
      if (!block) return;

      // Then visit successors
      const successors = this.getSuccessors(block);
      for (const succ of successors) {
        visit(succ);
      }
    };

    // Start from entry
    visit(func.entry);

    // Visit any unreachable blocks
    for (const blockId of func.blocks.keys()) {
      visit(blockId);
    }

    return result;
  }

  private getSuccessors(block: Ir.Block): string[] {
    switch (block.terminator.kind) {
      case "jump":
        return [block.terminator.target];
      case "branch":
        return [block.terminator.trueTarget, block.terminator.falseTarget];
      case "call":
        return [block.terminator.continuation];
      case "return":
        return [];
      default:
        return [];
    }
  }

  private formatSourceComment(
    debug?: Ir.Instruction.Debug | Ir.Block.Debug,
  ): string {
    if (!debug?.context || !this.source) {
      return "";
    }

    const context = debug.context;

    // Handle pick context - show all source locations on one line
    if ("pick" in context && Array.isArray(context.pick)) {
      const locations: string[] = [];
      for (const pickContext of context.pick) {
        const location = this.extractSourceLocation(pickContext);
        if (location) {
          locations.push(location);
        }
      }
      if (locations.length > 0) {
        return `; source: ${locations.join(" or ")}`;
      }
      return "";
    }

    // Handle direct code context
    return this.formatContextSourceComment(context);
  }

  private formatContextSourceComment(
    context: Format.Program.Context | undefined,
  ): string {
    if (!context || !this.source) {
      return "";
    }

    // Check for code.range (correct path according to ethdebug format)
    if (Format.Program.Context.isCode(context) && context.code.range) {
      const range = context.code.range;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        // Convert to AST SourceLocation format for the existing formatter
        const loc = {
          offset: range.offset,
          length: range.length,
        };
        return AstAnalysis.formatSourceComment(loc, this.source);
      }
    }

    return "";
  }

  private extractSourceLocation(
    context: Format.Program.Context | undefined,
  ): string | null {
    if (!context || !this.source) {
      return null;
    }

    // Check for code.range (correct path according to ethdebug format)
    if (Format.Program.Context.isCode(context) && context.code.range) {
      const range = context.code.range;
      if (
        typeof range.offset === "number" &&
        typeof range.length === "number"
      ) {
        // Convert to AST SourceLocation format and extract just the location part
        const loc = {
          offset: range.offset,
          length: range.length,
        };
        const fullComment = AstAnalysis.formatSourceComment(loc, this.source);
        // Extract just the location part (e.g., "16:3-11" from "; source: 16:3-11")
        const match = fullComment.match(/; source: (.+)/);
        return match ? match[1] : null;
      }
    }

    return null;
  }
}
