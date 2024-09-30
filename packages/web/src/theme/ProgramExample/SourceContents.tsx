import React, { useEffect } from "react";

import {
  ShikiCodeBlock,
  type Props as ShikiCodeBlockProps
} from "@theme/ShikiCodeBlock";

import "./SourceContents.css";

import type * as Shiki from "shiki/core";
import { useProgramExampleContext } from "./ProgramExampleContext";

import { Materials, Program } from "@ethdebug/format";

export function SourceContents(
  props: Omit<ShikiCodeBlockProps, "code" | "decorations">
): JSX.Element {
  const {
    sources,
    highlightedInstruction,
    highlightMode
  } = useProgramExampleContext();

  if (sources.length !== 1) {
    throw new Error("Multiple sources per example not currently supported");
  }

  const source = sources[0];

  const context = highlightedInstruction?.context;

  const simpleDecorations = Program.Context.isCode(context)
    ? decorateCodeContext(context, source)
    : [];

  const detailedDecorations = [
    ...simpleDecorations,
    ...(Program.Context.isVariables(context)
      ? decorateVariablesContext(context, source)
      : []
    )
  ];

  const decorations = highlightMode === "detailed"
    ? detailedDecorations
    : simpleDecorations;

  return <ShikiCodeBlock
    className="source-contents"
    code={source.contents}
    language="javascript"
    decorations={decorations}
    {...props}
  />;
}

function decorateCodeContext(
  { code }: Program.Context.Code,
  source: Materials.Source
): Shiki.DecorationItem[] {
  const { offset, length } = normalizeRange(code.range, source);

  return [
    {
      start: offset,
      end: offset + length,
      properties: {
        class: "highlighted-code"
      }
    }
  ];
}

function decorateVariablesContext(
  { variables }: Program.Context.Variables,
  source: Materials.Source
): Shiki.DecorationItem[] {

  return variables.map(({ declaration }) => {
    const { offset, length } = normalizeRange(declaration?.range, source);
    return {
      start: offset,
      end: offset + length,
      properties: {
        class: "highlighted-variable-declaration"
      }
    };
  });
}

function normalizeRange(
  range: Materials.SourceRange["range"],
  source: Materials.Source
): Materials.SourceRange["range"] & { offset: number; length: number } {
  const { offset, length } = range
    ? { offset: Number(range.offset), length: Number(range.length) }
    : { offset: 0, length: source.contents.length };

  return { offset, length };
}
