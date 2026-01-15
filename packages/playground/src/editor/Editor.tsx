import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { registerBugLanguage } from "./bugLanguage";
import type { editor as MonacoEditor_Type } from "monaco-editor";

export interface SourceRange {
  offset: number;
  length: number;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  highlightedRanges?: SourceRange[];
}

export function Editor({
  value,
  onChange,
  language = "bug",
  highlightedRanges = [],
}: EditorProps) {
  const editorRef = useRef<MonacoEditor_Type.IStandaloneCodeEditor | null>(
    null,
  );
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    registerBugLanguage();
  }, []);

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

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <MonacoEditor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(value) => onChange(value || "")}
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
