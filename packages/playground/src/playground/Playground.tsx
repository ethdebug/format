import { useState, useCallback, useEffect } from "react";
import { Editor, type SourceRange } from "../editor/Editor";
import { CompilerOutput } from "../compiler/CompilerOutput";
import { useCompiler } from "../compiler/useCompiler";
import { examples } from "./examples";
import "./Playground.css";

export function Playground() {
  const [code, setCode] = useState(examples[0].code);
  const [selectedExample, setSelectedExample] = useState(examples[0].name);
  const [optimizationLevel, setOptimizationLevel] = useState(3);
  const [highlightedRanges, setHighlightedRanges] = useState<SourceRange[]>([]);

  const { compileResult, isCompiling, compile } = useCompiler();

  const handleExampleChange = useCallback((exampleName: string) => {
    const example = examples.find((e) => e.name === exampleName);
    if (example) {
      setSelectedExample(exampleName);
      setCode(example.code);
    }
  }, []);

  const handleCompile = useCallback(() => {
    compile(code, optimizationLevel);
  }, [code, optimizationLevel, compile]);

  // Compile on initial load
  useEffect(() => {
    compile(code, optimizationLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="playground">
      <header className="playground-header">
        <h1>BUG Playground</h1>
        <div className="playground-controls">
          <select
            value={selectedExample}
            onChange={(e) => handleExampleChange(e.target.value)}
            className="example-select"
          >
            {examples.map((example) => (
              <option key={example.name} value={example.name}>
                {example.displayName}
              </option>
            ))}
          </select>

          <label className="optimization-control">
            Optimization Level:
            <select
              value={optimizationLevel}
              onChange={(e) => setOptimizationLevel(Number(e.target.value))}
            >
              <option value="0">0 - None</option>
              <option value="1">1 - Basic</option>
              <option value="2">2 - Standard</option>
              <option value="3">3 - Full</option>
            </select>
          </label>

          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="compile-button"
          >
            {isCompiling ? "Compiling..." : "Compile"}
          </button>
        </div>
      </header>

      <div className="playground-content">
        <div className="playground-editor">
          <Editor
            value={code}
            onChange={setCode}
            language="bug"
            highlightedRanges={highlightedRanges}
          />
        </div>
        <div className="playground-output">
          {compileResult && (
            <CompilerOutput
              result={compileResult}
              onOpcodeHover={setHighlightedRanges}
            />
          )}
        </div>
      </div>
    </div>
  );
}
