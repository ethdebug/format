/**
 * IrView component for displaying BUG compiler IR.
 */

import React, { useMemo } from "react";
import { Ir } from "@ethdebug/bugc";
import type { SourceRange } from "#types";
import {
  extractInstructionDebug,
  extractTerminatorDebug,
  extractPhiDebug,
  formatMultiLevelDebug,
  extractAllSourceRanges,
  extractOperandSourceRanges,
} from "#utils/irDebugUtils";
import { useEthdebugTooltip } from "#hooks/useEthdebugTooltip";
import { EthdebugTooltip } from "./EthdebugTooltip.js";
import "./IrView.css";

/**
 * Props for IrView component.
 */
export interface IrViewProps {
  /** The IR module to display */
  ir: Ir.Module;
  /** Callback when hovering over IR elements with source ranges */
  onOpcodeHover?: (ranges: SourceRange[]) => void;
}

interface HoverablePartData {
  text: string;
  ranges: SourceRange[];
  className?: string;
}

function HoverablePart({
  part,
  onHover,
  onLeave,
  onDebugIconHover,
  showDebugIcon,
}: {
  part: HoverablePartData;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  onDebugIconHover?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  showDebugIcon?: boolean;
}): JSX.Element {
  return (
    <span
      className={`hoverable-part ${part.className || ""} ${part.ranges.length > 0 ? "has-debug" : ""}`}
      onMouseEnter={() => onHover(part.ranges)}
      onMouseLeave={onLeave}
    >
      {part.text}
      {showDebugIcon && part.ranges.length > 0 && onDebugIconHover && (
        <span
          className="debug-info-icon inline"
          onMouseEnter={onDebugIconHover}
        >
          ℹ
        </span>
      )}
    </span>
  );
}

function formatValue(value: Ir.Value | bigint | string | boolean): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      return value;
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value.toString();
  }

  switch (value.kind) {
    case "const":
      return formatValue(value.value);
    case "temp":
      return `%${value.id}`;
    default:
      return "?";
  }
}

function formatType(type: Ir.Type): string {
  return type.kind;
}

function formatDest(dest: string, type?: Ir.Type): string {
  const prefix = dest.startsWith("t") ? "%" : "^";
  const formattedDest = `${prefix}${dest}`;
  return type ? `${formattedDest}: ${formatType(type)}` : formattedDest;
}

function InstructionRenderer({
  instruction,
  onHover,
  onLeave,
  showTooltip,
  pinTooltip,
  hideTooltip,
}: {
  instruction: Ir.Instruction;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  hideTooltip: () => void;
}): JSX.Element {
  const debugInfo = extractInstructionDebug(instruction);
  const operationRanges = debugInfo.operation?.context
    ? extractAllSourceRanges({ operation: debugInfo.operation, operands: [] })
    : [];

  const parts: (HoverablePartData | string)[] = [];

  const addOperand = (label: string, text: string, className?: string) => {
    const ranges = extractOperandSourceRanges(debugInfo, label);
    parts.push({ text, ranges, className });
  };

  const add = (text: string) => {
    parts.push(text);
  };

  switch (instruction.kind) {
    case "const":
      add(`${formatDest(instruction.dest, instruction.type)} = const `);
      addOperand("value", formatValue(instruction.value));
      break;

    case "allocate":
      add(
        `${formatDest(instruction.dest, Ir.Type.Scalar.uint256)} = allocate.${instruction.location}, size=`,
      );
      addOperand("size", formatValue(instruction.size));
      break;

    case "binary":
      add(`${formatDest(instruction.dest)} = ${instruction.op} `);
      addOperand("left", formatValue(instruction.left));
      add(", ");
      addOperand("right", formatValue(instruction.right));
      break;

    case "unary":
      add(`${formatDest(instruction.dest)} = ${instruction.op} `);
      addOperand("operand", formatValue(instruction.operand));
      break;

    case "env":
      add(`${formatDest(instruction.dest)} = env ${instruction.op}`);
      break;

    case "hash":
      add(`${formatDest(instruction.dest)} = hash `);
      addOperand("value", formatValue(instruction.value));
      break;

    case "cast":
      add(`${formatDest(instruction.dest, instruction.targetType)} = cast `);
      addOperand("value", formatValue(instruction.value));
      add(` to ${formatType(instruction.targetType)}`);
      break;

    case "length":
      add(`${formatDest(instruction.dest)} = length `);
      addOperand("object", formatValue(instruction.object));
      break;

    case "compute_slot": {
      const base = formatValue(instruction.base);
      add(`${formatDest(instruction.dest, Ir.Type.Scalar.uint256)} = slot[`);
      addOperand("base", base);
      if ("key" in instruction && instruction.key) {
        add("].mapping[");
        addOperand("key", formatValue(instruction.key));
        add("]");
      } else if (
        "slotKind" in instruction &&
        instruction.slotKind === "array"
      ) {
        add("].array");
      } else if ("fieldOffset" in instruction) {
        add(`].field[${instruction.fieldOffset}]`);
      } else {
        add("]");
      }
      break;
    }

    case "compute_offset": {
      const base = formatValue(instruction.base);
      const dest = instruction.dest.startsWith("t")
        ? `%${instruction.dest}`
        : instruction.dest;
      add(`${dest} = offset[`);
      addOperand("base", base);
      if ("index" in instruction && instruction.index) {
        if (instruction.stride === 32) {
          add("].array[");
          addOperand("index", formatValue(instruction.index));
          add("]");
        } else {
          add("].array[index: ");
          addOperand("index", formatValue(instruction.index));
          add(`, stride: ${instruction.stride}]`);
        }
      } else if ("offset" in instruction && instruction.offset) {
        add("].byte[");
        addOperand("offset", formatValue(instruction.offset));
        add("]");
      } else if ("fieldOffset" in instruction) {
        add(`].field[${instruction.fieldOffset}]`);
      } else {
        add("]");
      }
      break;
    }

    case "read": {
      const location = instruction.location;
      const isDefaultOffset =
        !instruction.offset ||
        (instruction.offset.kind === "const" &&
          instruction.offset.value === 0n);
      const isDefaultLength =
        !instruction.length ||
        (instruction.length.kind === "const" &&
          instruction.length.value === 32n);

      add(`${formatDest(instruction.dest, instruction.type)} = `);

      if (location === "storage" || location === "transient") {
        const slot = instruction.slot ? formatValue(instruction.slot) : "0";
        if (isDefaultOffset && isDefaultLength) {
          add(`${location}[`);
          addOperand("slot", slot);
          add("*]");
        } else {
          add(`${location}[slot: `);
          addOperand("slot", slot);
          if (!isDefaultOffset && instruction.offset) {
            add(", offset: ");
            addOperand("offset", formatValue(instruction.offset));
          }
          if (!isDefaultLength && instruction.length) {
            add(", length: ");
            addOperand("length", formatValue(instruction.length));
          }
          add("]");
        }
      } else {
        if (instruction.offset) {
          const offset = formatValue(instruction.offset);
          if (isDefaultLength) {
            add(`${location}[`);
            addOperand("offset", offset);
            add("*]");
          } else {
            add(`${location}[offset: `);
            addOperand("offset", offset);
            const length = instruction.length
              ? formatValue(instruction.length)
              : "32";
            add(", length: ");
            addOperand("length", length);
            add("]");
          }
        } else {
          add(`${location}[]`);
        }
      }
      break;
    }

    case "write": {
      const location = instruction.location;
      const value = formatValue(instruction.value);
      const isDefaultOffset =
        !instruction.offset ||
        (instruction.offset.kind === "const" &&
          instruction.offset.value === 0n);
      const isDefaultLength =
        !instruction.length ||
        (instruction.length.kind === "const" &&
          instruction.length.value === 32n);

      if (location === "storage" || location === "transient") {
        const slot = instruction.slot ? formatValue(instruction.slot) : "0";
        if (isDefaultOffset && isDefaultLength) {
          add(`${location}[`);
          addOperand("slot", slot);
          add("*] = ");
        } else {
          add(`${location}[slot: `);
          addOperand("slot", slot);
          if (!isDefaultOffset && instruction.offset) {
            add(", offset: ");
            addOperand("offset", formatValue(instruction.offset));
          }
          if (!isDefaultLength && instruction.length) {
            add(", length: ");
            addOperand("length", formatValue(instruction.length));
          }
          add("] = ");
        }
      } else {
        if (instruction.offset) {
          const offset = formatValue(instruction.offset);
          if (isDefaultLength) {
            add(`${location}[`);
            addOperand("offset", offset);
            add("*] = ");
          } else {
            add(`${location}[offset: `);
            addOperand("offset", offset);
            const length = instruction.length
              ? formatValue(instruction.length)
              : "32";
            add(", length: ");
            addOperand("length", length);
            add("] = ");
          }
        } else {
          add(`${location}[] = `);
        }
      }
      addOperand("value", value);
      break;
    }

    default:
      add(`; unknown instruction: ${(instruction as { kind?: string }).kind}`);
  }

  const hasAnyDebug =
    operationRanges.length > 0 ||
    debugInfo.operands.some((op) => op.debug?.context);

  const handleDebugIconHover = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    showTooltip(e, content);
  };

  const handleDebugIconClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    pinTooltip(e, content);
  };

  return (
    <div className="ir-instruction">
      {hasAnyDebug && (
        <span
          className="debug-info-icon"
          onMouseEnter={handleDebugIconHover}
          onMouseLeave={hideTooltip}
          onClick={handleDebugIconClick}
        >
          ℹ
        </span>
      )}
      {!hasAnyDebug && <span className="debug-info-spacer"></span>}
      <span
        className="instruction-operation"
        onMouseEnter={() => onHover(operationRanges)}
        onMouseLeave={onLeave}
      >
        {parts.map((part, idx) =>
          typeof part === "string" ? (
            <span key={idx}>{part}</span>
          ) : (
            <HoverablePart
              key={idx}
              part={part}
              onHover={onHover}
              onLeave={onLeave}
            />
          ),
        )}
      </span>
    </div>
  );
}

function TerminatorRenderer({
  terminator,
  onHover,
  onLeave,
  showTooltip,
  pinTooltip,
  hideTooltip,
}: {
  terminator: Ir.Block.Terminator;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  hideTooltip: () => void;
}): JSX.Element {
  const debugInfo = extractTerminatorDebug(terminator);
  const operationRanges = debugInfo.operation?.context
    ? extractAllSourceRanges({ operation: debugInfo.operation, operands: [] })
    : [];

  const parts: (HoverablePartData | string)[] = [];

  const addOperand = (label: string, text: string, className?: string) => {
    const ranges = extractOperandSourceRanges(debugInfo, label);
    parts.push({ text, ranges, className });
  };

  const add = (text: string) => {
    parts.push(text);
  };

  switch (terminator.kind) {
    case "jump":
      add(`jump ${terminator.target}`);
      break;

    case "branch":
      add("branch ");
      addOperand("condition", formatValue(terminator.condition));
      add(` ? ${terminator.trueTarget} : ${terminator.falseTarget}`);
      break;

    case "return":
      if (terminator.value) {
        add("return ");
        addOperand("value", formatValue(terminator.value));
      } else {
        add("return void");
      }
      break;

    case "call":
      if (terminator.dest) {
        add(`${terminator.dest} = `);
      }
      add(`call ${terminator.function}(`);
      terminator.arguments.forEach((arg, idx) => {
        if (idx > 0) add(", ");
        addOperand(`arg[${idx}]`, formatValue(arg));
      });
      add(`) -> ${terminator.continuation}`);
      break;
  }

  const hasAnyDebug =
    operationRanges.length > 0 ||
    debugInfo.operands.some((op) => op.debug?.context);

  const handleDebugIconHover = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    showTooltip(e, content);
  };

  const handleDebugIconClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    pinTooltip(e, content);
  };

  return (
    <div className="ir-terminator">
      {hasAnyDebug && (
        <span
          className="debug-info-icon"
          onMouseEnter={handleDebugIconHover}
          onMouseLeave={hideTooltip}
          onClick={handleDebugIconClick}
        >
          ℹ
        </span>
      )}
      {!hasAnyDebug && <span className="debug-info-spacer"></span>}
      <span
        className="terminator-operation"
        onMouseEnter={() => onHover(operationRanges)}
        onMouseLeave={onLeave}
      >
        {parts.map((part, idx) =>
          typeof part === "string" ? (
            <span key={idx}>{part}</span>
          ) : (
            <HoverablePart
              key={idx}
              part={part}
              onHover={onHover}
              onLeave={onLeave}
            />
          ),
        )}
      </span>
    </div>
  );
}

function PhiRenderer({
  phi,
  onHover,
  onLeave,
  showTooltip,
  pinTooltip,
  hideTooltip,
}: {
  phi: Ir.Block.Phi;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  hideTooltip: () => void;
}): JSX.Element {
  const debugInfo = extractPhiDebug(phi);
  const operationRanges = debugInfo.operation?.context
    ? extractAllSourceRanges({ operation: debugInfo.operation, operands: [] })
    : [];

  const hasAnyDebug =
    operationRanges.length > 0 ||
    debugInfo.operands.some((op) => op.debug?.context);

  const handleDebugIconHover = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    showTooltip(e, content);
  };

  const handleDebugIconClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const content = formatMultiLevelDebug(debugInfo);
    pinTooltip(e, content);
  };

  const parts: (HoverablePartData | string)[] = [];
  const add = (text: string) => parts.push(text);

  const dest = phi.dest.startsWith("t") ? `%${phi.dest}` : `^${phi.dest}`;
  const typeStr = phi.type ? `: ${formatType(phi.type)}` : "";
  add(`${dest}${typeStr} = phi `);

  const sources = Array.from(phi.sources.entries());
  sources.forEach(([pred, value], idx) => {
    if (idx > 0) add(", ");

    const label = `from ${pred}`;
    const ranges = extractOperandSourceRanges(debugInfo, label);
    parts.push({
      text: `[${pred}: ${formatValue(value)}]`,
      ranges,
    });
  });

  return (
    <div className="ir-phi">
      {hasAnyDebug && (
        <span
          className="debug-info-icon"
          onMouseEnter={handleDebugIconHover}
          onMouseLeave={hideTooltip}
          onClick={handleDebugIconClick}
        >
          ℹ
        </span>
      )}
      {!hasAnyDebug && <span className="debug-info-spacer"></span>}
      <span
        className="phi-operation"
        onMouseEnter={() => onHover(operationRanges)}
        onMouseLeave={onLeave}
      >
        {parts.map((part, idx) =>
          typeof part === "string" ? (
            <span key={idx}>{part}</span>
          ) : (
            <HoverablePart
              key={idx}
              part={part}
              onHover={onHover}
              onLeave={onLeave}
            />
          ),
        )}
      </span>
    </div>
  );
}

function BlockRenderer({
  blockId,
  block,
  isEntry,
  onHover,
  onLeave,
  showTooltip,
  pinTooltip,
  hideTooltip,
}: {
  blockId: string;
  block: Ir.Block;
  isEntry: boolean;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  hideTooltip: () => void;
}): JSX.Element {
  return (
    <div className="ir-block">
      <div className="block-header">
        <strong>{blockId}:</strong>
        {isEntry && <span className="entry-badge">entry</span>}
      </div>
      <div className="block-body">
        {block.phis.map((phi, idx) => (
          <PhiRenderer
            key={idx}
            phi={phi}
            onHover={onHover}
            onLeave={onLeave}
            showTooltip={showTooltip}
            pinTooltip={pinTooltip}
            hideTooltip={hideTooltip}
          />
        ))}
        {block.instructions.map((instruction, idx) => (
          <InstructionRenderer
            key={idx}
            instruction={instruction}
            onHover={onHover}
            onLeave={onLeave}
            showTooltip={showTooltip}
            pinTooltip={pinTooltip}
            hideTooltip={hideTooltip}
          />
        ))}
        <TerminatorRenderer
          terminator={block.terminator}
          onHover={onHover}
          onLeave={onLeave}
          showTooltip={showTooltip}
          pinTooltip={pinTooltip}
          hideTooltip={hideTooltip}
        />
      </div>
    </div>
  );
}

function FunctionRenderer({
  name,
  func,
  onHover,
  onLeave,
  showTooltip,
  pinTooltip,
  hideTooltip,
}: {
  name: string;
  func: Ir.Function;
  onHover: (ranges: SourceRange[]) => void;
  onLeave: () => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  hideTooltip: () => void;
}): JSX.Element {
  const sortedBlocks = useMemo(() => {
    const result: [string, Ir.Block][] = [];
    const visited = new Set<string>();
    const tempMarked = new Set<string>();

    const visit = (blockId: string) => {
      if (tempMarked.has(blockId)) return;
      if (visited.has(blockId)) return;

      tempMarked.add(blockId);

      const block = func.blocks.get(blockId);
      if (!block) return;

      const term = block.terminator;
      if (term.kind === "jump") {
        visit(term.target);
      } else if (term.kind === "branch") {
        visit(term.trueTarget);
        visit(term.falseTarget);
      } else if (term.kind === "call") {
        visit(term.continuation);
      }

      tempMarked.delete(blockId);
      visited.add(blockId);
      result.unshift([blockId, block]);
    };

    visit(func.entry);

    for (const [blockId, block] of func.blocks) {
      if (!visited.has(blockId)) {
        result.push([blockId, block]);
      }
    }

    return result;
  }, [func]);

  return (
    <div className="ir-function">
      <div className="function-header">
        <h4>{name}:</h4>
      </div>
      {sortedBlocks.map(([blockId, block]) => (
        <BlockRenderer
          key={blockId}
          blockId={blockId}
          block={block}
          isEntry={blockId === func.entry}
          onHover={onHover}
          onLeave={onLeave}
          showTooltip={showTooltip}
          pinTooltip={pinTooltip}
          hideTooltip={hideTooltip}
        />
      ))}
    </div>
  );
}

/**
 * Displays the IR (Intermediate Representation) from a BUG compilation.
 *
 * Shows functions, blocks, instructions, and terminators with interactive
 * source highlighting.
 *
 * @param props - IR module and callbacks
 * @returns IrView element
 *
 * @example
 * ```tsx
 * <IrView
 *   ir={compileResult.ir}
 *   onOpcodeHover={(ranges) => setHighlightedRanges(ranges)}
 * />
 * ```
 */
export function IrView({ ir, onOpcodeHover }: IrViewProps): JSX.Element {
  const {
    tooltip,
    setTooltip,
    showTooltip,
    pinTooltip,
    hideTooltip,
    closeTooltip,
  } = useEthdebugTooltip();

  const handleHover = (ranges: SourceRange[]) => {
    onOpcodeHover?.(ranges);
  };

  const handleLeave = () => {
    onOpcodeHover?.([]);
  };

  const mainBlocks = ir.main.blocks.size;
  const createBlocks = ir.create?.blocks.size || 0;
  const userFunctionCount = ir.functions?.size || 0;
  let userFunctionBlocks = 0;
  if (ir.functions) {
    for (const func of ir.functions.values()) {
      userFunctionBlocks += func.blocks.size;
    }
  }

  return (
    <div className="ir-view">
      <div className="ir-header">
        <h3>IR</h3>
        <div className="ir-stats">
          {userFunctionCount > 0 && (
            <span>
              Functions: {userFunctionCount} ({userFunctionBlocks} blocks)
            </span>
          )}
          {ir.create && <span>Create: {createBlocks} blocks</span>}
          <span>Main: {mainBlocks} blocks</span>
        </div>
      </div>
      <div className="ir-content">
        {ir.functions && ir.functions.size > 0 && (
          <>
            <div className="section-label">User Functions:</div>
            {Array.from(ir.functions.entries()).map(([name, func]) => (
              <FunctionRenderer
                key={name}
                name={name}
                func={func}
                onHover={handleHover}
                onLeave={handleLeave}
                showTooltip={showTooltip}
                pinTooltip={pinTooltip}
                hideTooltip={hideTooltip}
              />
            ))}
          </>
        )}
        {ir.create && (
          <>
            <div className="section-label">Constructor:</div>
            <FunctionRenderer
              name="create"
              func={ir.create}
              onHover={handleHover}
              onLeave={handleLeave}
              showTooltip={showTooltip}
              pinTooltip={pinTooltip}
              hideTooltip={hideTooltip}
            />
          </>
        )}
        <div className="section-label">Main (Runtime):</div>
        <FunctionRenderer
          name="main"
          func={ir.main}
          onHover={handleHover}
          onLeave={handleLeave}
          showTooltip={showTooltip}
          pinTooltip={pinTooltip}
          hideTooltip={hideTooltip}
        />
      </div>
      <EthdebugTooltip
        tooltip={tooltip}
        onUpdate={setTooltip}
        onClose={closeTooltip}
      />
    </div>
  );
}
