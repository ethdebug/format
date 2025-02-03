import React, { useEffect, useState } from "react";
import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import { useProgramExampleContext } from "./ProgramExampleContext";

import { type Instruction } from "./types";
import { ShikiCodeBlock } from "@theme/ShikiCodeBlock";

export function HighlightedInstruction(): JSX.Element {
  const {
    highlightedInstruction,
    highlightedOffset
  } = useProgramExampleContext();

  const link = <Link to="/spec/program/instruction">
    <strong>ethdebug/format/program</strong> Instruction schema
  </Link>;

  if (highlightedOffset === undefined) {
    return <Admonition type="tip">
      Hover or click on an offset above to see the {link} object
      for that instruction.
    </Admonition>;
  }

  return <>
    <Admonition type="info">
      The following is the {link} object for the selected instruction.
    </Admonition>

    <ShikiCodeBlock
      language="javascript"
      code={
        JSON.stringify(highlightedInstruction, undefined, 2)
      }
    />
  </>;
}
