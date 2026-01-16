/**
 * React hook for Shiki syntax highlighter.
 */

import { useEffect, useState } from "react";

import * as Shiki from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

/**
 * Highlighter interface for syntax highlighting.
 */
export interface Highlighter {
  highlight(text: string, options: HighlightOptions): string;
}

/**
 * Options for highlighting code.
 */
export interface HighlightOptions {
  language?: string;
  decorations?: Shiki.DecorationItem[];
  className?: string;
}

/**
 * React hook that provides a Shiki highlighter instance.
 *
 * The highlighter is created asynchronously on mount.
 *
 * @returns Highlighter instance or undefined while loading
 */
export function useHighlighter(): Highlighter | undefined {
  const [highlighter, setHighlighter] = useState<Highlighter | undefined>();

  useEffect(() => {
    createHighlighter().then(setHighlighter);
  }, [setHighlighter]);

  return highlighter;
}

async function createHighlighter(): Promise<Highlighter> {
  const shiki = await Shiki.createHighlighterCore({
    themes: [import("@shikijs/themes/github-light")],
    langs: [
      import("@shikijs/langs/solidity"),
      import("@shikijs/langs/javascript"),
    ],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  });

  const themeName = "github-light";

  return {
    highlight(text, { language, decorations }) {
      return shiki.codeToHtml(text, {
        lang: language || "text",
        theme: themeName,
        decorations,
      });
    },
  };
}
