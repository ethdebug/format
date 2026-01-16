/**
 * BytecodeView component for displaying compiled EVM bytecode.
 */

import React from "react";
import type { Evm } from "@ethdebug/bugc";
import type { BytecodeOutput, SourceRange } from "#types";
import { extractSourceRange } from "#utils/debugUtils";
import { useEthdebugTooltip } from "#hooks/useEthdebugTooltip";
import { EthdebugTooltip } from "./EthdebugTooltip.js";

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

  const handleDebugIconMouseEnter = (
    e: React.MouseEvent<HTMLSpanElement>,
    instruction: Evm.Instruction,
  ) => {
    if (instruction.debug?.context) {
      showTooltip(e, JSON.stringify(instruction.debug.context, null, 2));
    }
  };

  const handleDebugIconClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    instruction: Evm.Instruction,
  ) => {
    if (instruction.debug?.context) {
      pinTooltip(e, JSON.stringify(instruction.debug.context, null, 2));
    }
  };

  return (
    <div className="bytecode-disassembly-interactive">
      {instructions.map((instruction, idx) => {
        const currentPc = pc;
        pc += 1 + (instruction.immediates?.length || 0);

        const sourceRanges = extractSourceRange(instruction.debug?.context);
        const hasDebugInfo = !!instruction.debug?.context;

        return (
          <div
            key={idx}
            className={`opcode-line ${hasDebugInfo ? "has-debug-info" : ""}`}
            onMouseEnter={() => handleOpcodeMouseEnter(sourceRanges)}
            onMouseLeave={handleOpcodeMouseLeave}
          >
            {hasDebugInfo ? (
              <span
                className="debug-info-icon"
                onMouseEnter={(e) => handleDebugIconMouseEnter(e, instruction)}
                onMouseLeave={hideTooltip}
                onClick={(e) => handleDebugIconClick(e, instruction)}
              >
                ℹ
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
