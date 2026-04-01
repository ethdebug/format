/**
 * BytecodeView component for displaying compiled EVM bytecode.
 */

import React from "react";
import type { Evm } from "@ethdebug/bugc";
import type { BytecodeOutput, SourceRange } from "#types";
import {
  extractSourceRange,
  classifyContext,
  summarizeContext,
  type ContextKind,
} from "#utils/debugUtils";
import { useEthdebugTooltip } from "#hooks/useEthdebugTooltip";
import { EthdebugTooltip } from "./EthdebugTooltip.js";

function contextBadgeLabel(kind: ContextKind): string {
  switch (kind) {
    case "invoke":
      return "\u279c"; // arrow right
    case "return":
      return "\u21b5"; // return arrow
    case "revert":
      return "\u2717"; // x mark
    default:
      return "\u2139"; // info
  }
}

/**
 * Props for BytecodeView component.
 */
export interface BytecodeViewProps {
  /** Compiled bytecode output */
  bytecode: BytecodeOutput;
  /** Callback when hovering over an opcode with source ranges */
  onOpcodeHover?: (ranges: SourceRange[]) => void;
}

interface InstructionsViewProps {
  instructions: Evm.Instruction[];
  onOpcodeHover?: (ranges: SourceRange[]) => void;
}

function InstructionsView({
  instructions,
  onOpcodeHover,
}: InstructionsViewProps): JSX.Element {
  const {
    tooltip,
    setTooltip,
    showTooltip,
    pinTooltip,
    hideTooltip,
    closeTooltip,
  } = useEthdebugTooltip();

  let pc = 0;

  const handleOpcodeMouseEnter = (sourceRanges: SourceRange[]) => {
    onOpcodeHover?.(sourceRanges);
  };

  const handleOpcodeMouseLeave = () => {
    onOpcodeHover?.([]);
  };

  const formatTooltipContent = (instruction: Evm.Instruction): string => {
    const ctx = instruction.debug?.context;
    if (!ctx) return "";

    const summary = summarizeContext(ctx);
    const lines: string[] = [];

    if (
      summary.kind === "invoke" ||
      summary.kind === "return" ||
      summary.kind === "revert"
    ) {
      lines.push(summary.label);
      if (summary.details) {
        lines.push(`  (${summary.details})`);
      }
      lines.push("");
    }

    lines.push(JSON.stringify(ctx, null, 2));
    return lines.join("\n");
  };

  const handleDebugIconMouseEnter = (
    e: React.MouseEvent<HTMLSpanElement>,
    instruction: Evm.Instruction,
  ) => {
    if (instruction.debug?.context) {
      showTooltip(e, formatTooltipContent(instruction));
    }
  };

  const handleDebugIconClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    instruction: Evm.Instruction,
  ) => {
    if (instruction.debug?.context) {
      pinTooltip(e, formatTooltipContent(instruction));
    }
  };

  return (
    <div className="bytecode-disassembly-interactive">
      {instructions.map((instruction, idx) => {
        const currentPc = pc;
        pc += 1 + (instruction.immediates?.length || 0);

        const sourceRanges = extractSourceRange(instruction.debug?.context);
        const hasDebugInfo = !!instruction.debug?.context;
        const kind: ContextKind = hasDebugInfo
          ? classifyContext(instruction.debug?.context)
          : "other";
        const isCallContext =
          kind === "invoke" || kind === "return" || kind === "revert";

        return (
          <div
            key={idx}
            className={[
              "opcode-line",
              hasDebugInfo ? "has-debug-info" : "",
              isCallContext ? `context-${kind}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => handleOpcodeMouseEnter(sourceRanges)}
            onMouseLeave={handleOpcodeMouseLeave}
          >
            {isCallContext ? (
              <span
                className={`context-badge context-badge-${kind}`}
                onMouseEnter={(e) => handleDebugIconMouseEnter(e, instruction)}
                onMouseLeave={hideTooltip}
                onClick={(e) => handleDebugIconClick(e, instruction)}
                title={summarizeContext(instruction.debug?.context).label}
              >
                {contextBadgeLabel(kind)}
              </span>
            ) : hasDebugInfo ? (
              <span
                className="debug-info-icon"
                onMouseEnter={(e) => handleDebugIconMouseEnter(e, instruction)}
                onMouseLeave={hideTooltip}
                onClick={(e) => handleDebugIconClick(e, instruction)}
              >
                {"\u2139"}
              </span>
            ) : (
              <span className="debug-info-spacer"></span>
            )}
            <span className="pc">{currentPc.toString().padStart(4, "0")}</span>
            <span className="opcode">{instruction.mnemonic}</span>
            {instruction.immediates && instruction.immediates.length > 0 && (
              <span className="immediates">
                0x
                {instruction.immediates
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("")}
              </span>
            )}
            {isCallContext && (
              <span className={`context-label context-label-${kind}`}>
                {summarizeContext(instruction.debug?.context).label}
              </span>
            )}
          </div>
        );
      })}
      <EthdebugTooltip
        tooltip={tooltip}
        onUpdate={setTooltip}
        onClose={closeTooltip}
      />
    </div>
  );
}

/**
 * Displays compiled EVM bytecode with interactive disassembly.
 *
 * Shows both hex representation and disassembled instructions.
 * Supports hovering over opcodes to highlight source ranges.
 *
 * @param props - Bytecode output and callbacks
 * @returns BytecodeView element
 *
 * @example
 * ```tsx
 * <BytecodeView
 *   bytecode={compileResult.bytecode}
 *   onOpcodeHover={(ranges) => setHighlightedRanges(ranges)}
 * />
 * ```
 */
export function BytecodeView({
  bytecode,
  onOpcodeHover,
}: BytecodeViewProps): JSX.Element {
  const runtimeHex = Array.from(bytecode.runtime)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const constructorHex = bytecode.create
    ? Array.from(bytecode.create)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    : null;

  return (
    <div className="bytecode-view">
      {bytecode.create && (
        <>
          <div className="bytecode-header">
            <h3>Constructor Bytecode</h3>
            <div className="bytecode-stats">
              <span>Size: {bytecode.create.length / 2} bytes</span>
            </div>
          </div>

          <div className="bytecode-content">
            <div className="bytecode-section">
              <h4>Hex</h4>
              <pre className="bytecode-hex">{constructorHex}</pre>
            </div>

            <div className="bytecode-section">
              <h4>Instructions</h4>
              {bytecode.createInstructions && (
                <InstructionsView
                  instructions={bytecode.createInstructions}
                  onOpcodeHover={onOpcodeHover}
                />
              )}
            </div>
          </div>

          <hr className="bytecode-separator" />
        </>
      )}

      <div className="bytecode-header">
        <h3>{bytecode.create ? "Runtime Bytecode" : "EVM Bytecode"}</h3>
        <div className="bytecode-stats">
          <span>Size: {bytecode.runtime.length / 2} bytes</span>
        </div>
      </div>

      <div className="bytecode-content">
        <div className="bytecode-section">
          <h4>Hex</h4>
          <pre className="bytecode-hex">{runtimeHex}</pre>
        </div>

        <div className="bytecode-section">
          <h4>Instructions</h4>
          <InstructionsView
            instructions={bytecode.runtimeInstructions}
            onOpcodeHover={onOpcodeHover}
          />
        </div>
      </div>
    </div>
  );
}
