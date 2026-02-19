/**
 * Simple code block component using Shiki syntax highlighting.
 */

import React from "react";
import { type HighlightOptions, useHighlighter } from "./useHighlighter.js";

/**
 * Props for ShikiCodeBlock component.
 */
export interface ShikiCodeBlockProps extends HighlightOptions {
  code: string;
  className?: string;
}

/**
 * Renders a code block with syntax highlighting using Shiki.
 *
 * @param props - Code and highlight options
 * @returns Highlighted code block element
 */
export function ShikiCodeBlock({
  code,
  className,
  ...highlightOptions
}: ShikiCodeBlockProps): JSX.Element {
  const highlighter = useHighlighter();

  if (!highlighter) {
    return <>Loading...</>;
  }

  const html = highlighter.highlight(code, highlightOptions);

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
