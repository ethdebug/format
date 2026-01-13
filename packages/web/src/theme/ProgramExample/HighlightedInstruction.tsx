import React from "react";
import { useProgramExampleContext } from "./ProgramExampleContext";

import { ShikiCodeBlock } from "@theme/ShikiCodeBlock";

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
