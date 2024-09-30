import React, { useEffect, useState } from "react";
import Admonition from "@theme/Admonition";
import Link from "@docusaurus/Link";
import { useProgramExampleContext } from "./ProgramExampleContext";

import { ShikiCodeBlock } from "@theme/ShikiCodeBlock";

export function HighlightedInstruction(): JSX.Element {
  const { highlightedInstruction } = useProgramExampleContext();

  return <>
    <ShikiCodeBlock
      language="javascript"
      code={
        JSON.stringify(highlightedInstruction, undefined, 2)
      }
    />
  </>;
}
