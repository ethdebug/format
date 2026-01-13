import React from "react";
import {
  type Highlighter,
  type HighlightOptions,
  useHighlighter,
} from "./useHighlighter";

export interface Props extends HighlightOptions {
  code: string;
}

export function ShikiCodeBlock({
  code,
  ...highlightOptions
}: Props): JSX.Element {
  const highlighter = useHighlighter();

  if (!highlighter) {
    return <>Loading...</>;
  }

  const html = highlighter.highlight(code, highlightOptions);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
