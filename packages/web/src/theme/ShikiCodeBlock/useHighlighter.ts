import { useEffect, useState } from "react";

import * as Shiki from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

export interface Highlighter {
  highlight(text: string, options: HighlightOptions): string;
}

export interface HighlightOptions {
  language?: string;
  decorations?: Shiki.DecorationItem[];
}

export function useHighlighter() {
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
