/**
 * Monaco editor component for editing BUG source code.
 *
 * Note: This component requires optional peer dependency:
 * - @monaco-editor/react
 */

import React, { useEffect, useRef, useState } from "react";
import { registerBugLanguage } from "#utils/bugLanguage";

/**
 * Represents a range in the source by offset and length.
 */
export interface EditorSourceRange {
  /** Starting byte offset */
  offset: number;
  /** Length in bytes */
  length: number;
}

/**
 * Props for Editor component.
 */
export interface EditorProps {
  /** Current source code value */
  value: string;
  /** Callback when source code changes */
  onChange: (value: string) => void;
  /** Language mode (default: "bug") */
  language?: string;
  /** Ranges to highlight in the editor */
  highlightedRanges?: EditorSourceRange[];
  /** Theme mode (default: auto-detect from document) */
  theme?: "light" | "dark" | "auto";
  /** Editor height (default: "100%") */
  height?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monacoEditorModule: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monacoModule: any;
let monacoLoaded = false;

async function loadMonaco(): Promise<boolean> {
  if (monacoLoaded) {
    return true;
  }

  try {
    monacoEditorModule = await import("@monaco-editor/react");
    monacoModule = await import("monaco-editor");
    registerBugLanguage(monacoModule);
    monacoLoaded = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Monaco editor component for editing BUG source code.
 *
 * Supports syntax highlighting, source range highlighting, and auto-theme
 * detection.
 *
 * Requires optional peer dependency: @monaco-editor/react
 *
 * @param props - Editor configuration
 * @returns Editor element
 *
 * @example
 * ```tsx
 * <Editor
 *   value={sourceCode}
 *   onChange={setSourceCode}
 *   highlightedRanges={highlightedRanges}
 * />
 * ```
 */
export function Editor({
  value,
  onChange,
  language = "bug",
  highlightedRanges = [],
  theme = "auto",
  height = "100%",
}: EditorProps): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const [loaded, setLoaded] = useState(monacoLoaded);
  const [error, setError] = useState<string | null>(null);

  // Detect theme from document
  const [detectedTheme, setDetectedTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    if (theme === "auto") {
      const detectTheme = () => {
        const dataTheme = document.documentElement.getAttribute("data-theme");
        setDetectedTheme(dataTheme === "dark" ? "dark" : "light");
      };
      detectTheme();

      // Watch for theme changes
      const observer = new MutationObserver(detectTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      return () => observer.disconnect();
    }
  }, [theme]);

  const effectiveTheme = theme === "auto" ? detectedTheme : theme;
  const monacoTheme = effectiveTheme === "dark" ? "vs-dark" : "vs";

  // Load Monaco
  useEffect(() => {
    if (!loaded) {
      loadMonaco()
        .then((success) => {
          if (success) {
            setLoaded(true);
          } else {
            setError(
              "Editor requires @monaco-editor/react package. " +
                "Please install it: npm install @monaco-editor/react",
            );
          }
        })
        .catch(() => {
          setError("Failed to load Monaco editor");
        });
    }
  }, [loaded]);

  // Handle decorations for highlighted ranges
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }

    // Clear previous decorations
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      [],
    );

    // Add new decorations for all highlighted ranges
    if (highlightedRanges.length > 0) {
      const decorations = highlightedRanges.map((range, index) => {
        const startPosition = model.getPositionAt(range.offset);
        const endPosition = model.getPositionAt(range.offset + range.length);

        // First range is "primary", rest are "alternative"
        const isPrimary = index === 0;
        const className = isPrimary
          ? "opcode-hover-highlight"
          : "opcode-hover-highlight-alternative";
        const inlineClassName = isPrimary
          ? "opcode-hover-highlight-inline"
          : "opcode-hover-highlight-alternative-inline";

        return {
          range: {
            startLineNumber: startPosition.lineNumber,
            startColumn: startPosition.column,
            endLineNumber: endPosition.lineNumber,
            endColumn: endPosition.column,
          },
          options: {
            className,
            isWholeLine: false,
            inlineClassName,
          },
        };
      });

      decorationsRef.current = editor.deltaDecorations([], decorations);

      // Scroll to the first (primary) highlighted range
      const firstRange = highlightedRanges[0];
      const startPosition = model.getPositionAt(firstRange.offset);
      const endPosition = model.getPositionAt(
        firstRange.offset + firstRange.length,
      );
      editor.revealRangeInCenter({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      });
    }
  }, [highlightedRanges]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  if (error) {
    return (
      <div
        style={{ padding: "1rem", color: "var(--bugc-accent-red, #cf222e)" }}
      >
        {error}
      </div>
    );
  }

  if (!loaded || !monacoEditorModule) {
    return <div style={{ padding: "1rem" }}>Loading editor...</div>;
  }

  const MonacoEditor = monacoEditorModule.default;

  return (
    <MonacoEditor
      height={height}
      language={language}
      theme={monacoTheme}
      value={value}
      onChange={(val: string | undefined) => onChange(val || "")}
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
