import React, { useEffect, useState } from "react";
import { useProgramExampleContext } from "./ProgramExampleContext";

import { Data, Program } from "@ethdebug/format";

import "./Opcodes.css";

export function Opcodes(): JSX.Element {
  const {
    instructions,
    highlightedInstruction,
    highlightInstruction,
    highlightMode,
    showDetails,
    hideDetails,
  } = useProgramExampleContext();

  const [activeOffset, setActiveOffset] = useState<Data.Value | undefined>();
  const [hoverOffset, setHoverOffset] = useState<Data.Value | undefined>();

  useEffect(() => {
    if (activeOffset !== undefined) {
      if (highlightedInstruction?.offset !== activeOffset) {
        highlightInstruction(activeOffset);
      }

      if (highlightMode === "simple") {
        showDetails();
      }

      return;
    }

    if (highlightMode === "detailed") {
      hideDetails();
    }

    if (hoverOffset !== undefined) {
      if (highlightedInstruction?.offset !== hoverOffset) {
        highlightInstruction(hoverOffset);
      }

      return;
    }

    highlightInstruction(undefined);
  }, [activeOffset, hoverOffset, highlightedInstruction, highlightMode]);

  const handleClick = (offset: Data.Value) =>
    offset === activeOffset
      ? setActiveOffset(undefined)
      : setActiveOffset(offset);

  const handleMouseEnter = (offset: Data.Value) => setHoverOffset(offset);
  // skipping the current hover offset check here and assuming that the mouse
  // must leave the boundary of one offset before entering another
  const handleMouseLeave = (_offset: Data.Value) => setHoverOffset(undefined);

  const paddingLength = instructions.at(-1)!.offset.toString(16).length;

  return (
    <dl className="opcodes">
      {instructions.map((instruction) => (
        <Opcode
          key={instruction.offset}
          instruction={instruction}
          active={activeOffset === instruction.offset}
          paddingLength={paddingLength}
          onClick={() => handleClick(instruction.offset)}
          onMouseEnter={() => handleMouseEnter(instruction.offset)}
          onMouseLeave={() => handleMouseLeave(instruction.offset)}
        />
      ))}
    </dl>
  );
}

function Opcode(props: {
  instruction: Program.Instruction;
  active: boolean;
  paddingLength: number;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const {
    instruction,
    active,
    paddingLength,
    onClick,
    onMouseEnter,
    onMouseLeave,
  } = props;

  const { offset, operation, context } = instruction;

  const offsetLabel = <>0x{offset.toString(16).padStart(paddingLength, "0")}</>;

  const commentLabel =
    context && "remark" in context ? <> ({context.remark})</> : <></>;

  const operationLabel = (
    <>
      {operation && (
        <code>
          {[operation.mnemonic, ...(operation.arguments || [])].join(" ")}
        </code>
      )}
      {commentLabel}
    </>
  );

  return (
    <>
      <dt
        className={active ? "active" : ""}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        title="Click for more instruction details"
      >
        {offsetLabel}
      </dt>
      <dd onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {operationLabel}
      </dd>
    </>
  );
}
