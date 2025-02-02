import React, { useEffect } from "react";

import {
  ShikiCodeBlock,
  type Props as ShikiCodeBlockProps
} from "@theme/ShikiCodeBlock";

import { useProgramExampleContext } from "./ProgramExampleContext";

export function SourceContents(
  props: Omit<ShikiCodeBlockProps, "code" | "decorations">
): JSX.Element {
  const {
    sourceContents,
    context
  } = useProgramExampleContext();

  useEffect(() => {
    console.log("context %o", context);
  }, [context]);

  const decorations = (
    context !== undefined &&
    "code" in context  && context.code &&
    "range" in context.code && context.code.range
  )
    ? [{
        start: context.code.range.offset,
        end: context.code.range.offset + context.code.range.length,
        properties: {
          style: "font-weight: bold; background-color: var(--ifm-color-primary-lightest);"
        }
      }]
    : [];

  return <ShikiCodeBlock
    code={sourceContents}
    language="javascript"
    decorations={decorations}
    {...props}
  />;
}

