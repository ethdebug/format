/**
 * Displays the currently highlighted instruction as JSON.
 */

import React from "react";
import { useProgramExampleContext } from "./ProgramExampleContext.js";

import { ShikiCodeBlock } from "#shiki/ShikiCodeBlock";

/**
 * Renders the currently highlighted instruction as formatted JSON.
 *
 * @returns JSON representation of the highlighted instruction
 */
export function HighlightedInstruction(): JSX.Element {
  const { highlightedInstruction } = useProgramExampleContext();

  return (
    <>
      <ShikiCodeBlock
        language="javascript"
        code={JSON.stringify(highlightedInstruction, undefined, 2)}
      />
    </>
  );
}
