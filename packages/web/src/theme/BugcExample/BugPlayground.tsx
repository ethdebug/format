/**
 * BugPlayground component for the Docusaurus site.
 *
 * Provides an interactive BUG compiler playground with editor and output views.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  compile as bugCompile,
  type BugError,
  Severity,
  type Ast,
  type Ir,
} from "@ethdebug/bugc";
import {
  Editor,
  AstView,
  IrView,
  CfgView,
  BytecodeView,
  type SourceRange,
  type BytecodeOutput,
} from "@ethdebug/bugc-react";
import "./BugPlayground.css";

// Import CSS for bugc-react components
import "./variables.css";
import "./AstView.css";
import "./BytecodeView.css";
import "./CfgView.css";
import "./EthdebugTooltip.css";
import "./IrView.css";

/**
 * Result of a BUG compilation.
 */
export interface CompileResult {
  success: boolean;
  error?: string;
  ast?: Ast.Contract;
  ir?: Ir.Module;
  bytecode?: BytecodeOutput;
  warnings: string[];
}

/**
 * Compile BUG source code.
 */
async function compile(
  code: string,
  optimizationLevel: number,
): Promise<CompileResult> {
  // Get AST
  const astResult = await bugCompile({ to: "ast", source: code });

  if (!astResult.success) {
    const errors = astResult.messages[Severity.Error] || [];
    const warnings = astResult.messages[Severity.Warning] || [];
    return {
      success: false,
      error: errors[0]?.message || "Parse failed",
      warnings: warnings.map((w: BugError) => w.message),
    };
  }

  const ast = astResult.value.ast;

  // Get IR
  const irResult = await bugCompile({
    to: "ir",
    source: code,
    optimizer: { level: optimizationLevel as 0 | 1 | 2 | 3 },
  });

  if (!irResult.success) {
    const errors = irResult.messages[Severity.Error] || [];
    const warnings = irResult.messages[Severity.Warning] || [];
    return {
      success: false,
      error: errors[0]?.message || "IR generation failed",
      ast,
      warnings: warnings.map((w: BugError) => w.message),
    };
  }

  const ir = irResult.value.ir;

  // Get bytecode
  const bytecodeResult = await bugCompile({
    to: "bytecode",
    source: code,
    optimizer: { level: optimizationLevel as 0 | 1 | 2 | 3 },
  });

  if (!bytecodeResult.success) {
    const errors = bytecodeResult.messages[Severity.Error] || [];
    const warnings = bytecodeResult.messages[Severity.Warning] || [];
    return {
      success: false,
      error: errors[0]?.message || "Bytecode generation failed",
      ast,
      warnings: warnings.map((w: BugError) => w.message),
    };
  }

  const bytecode = {
    runtime: bytecodeResult.value.bytecode.runtime,
    create: bytecodeResult.value.bytecode.create,
    runtimeInstructions: bytecodeResult.value.bytecode.runtimeInstructions,
    createInstructions: bytecodeResult.value.bytecode.createInstructions,
  };

  // Collect warnings
  const allWarnings = [
    ...(astResult.messages[Severity.Warning] || []),
    ...(irResult.messages[Severity.Warning] || []),
    ...(bytecodeResult.messages[Severity.Warning] || []),
  ].map((w: BugError) => w.message);

  return {
    success: true,
    ast,
    ir,
    bytecode,
    warnings: [...new Set(allWarnings)],
  };
}

type TabType = "ast" | "ir" | "cfg" | "bytecode";

export interface BugPlaygroundProps {
  /** Initial code to display in the editor */
  initialCode?: string;
  /** Default optimization level (0-3) */
  defaultOptimizationLevel?: number;
  /** Whether to show optimization level selector */
  showOptimizationSelector?: boolean;
  /** Height of the playground */
  height?: string;
}

/**
 * Interactive BUG compiler playground.
 */
export function BugPlayground({
  initialCode = `name Counter;

storage {
  [0] count: uint256;
  [1] threshold: uint256;
}

create {
  count = 0;
  threshold = 100;
}

code {
  // Increment the counter
  count = count + 1;

  // Check threshold
  if (count >= threshold) {
    count = 0;
  }
}
`,
  defaultOptimizationLevel = 3,
  showOptimizationSelector = true,
  height = "600px",
}: BugPlaygroundProps): JSX.Element {
  const [code, setCode] = useState(initialCode);
  const [optimizationLevel, setOptimizationLevel] = useState(
    defaultOptimizationLevel,
  );
  const [compileResult, setCompileResult] = useState<CompileResult | null>(
    null,
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("ast");
  const [highlightedRanges, setHighlightedRanges] = useState<SourceRange[]>([]);

  // Handler for hovering over IR/Bytecode elements
  const handleOpcodeHover = useCallback((ranges: SourceRange[]) => {
    setHighlightedRanges(ranges);
  }, []);

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    try {
      const result = await compile(code, optimizationLevel);
      setCompileResult(result);
      if (!result.success) {
        setActiveTab("ast"); // Show AST tab for errors
      }
    } catch (error) {
      setCompileResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        warnings: [],
      });
    } finally {
      setIsCompiling(false);
    }
  }, [code, optimizationLevel]);

  // Compile on mount
  useEffect(() => {
    handleCompile();
  }, []);

  const tabs: { id: TabType; label: string }[] = [
    { id: "ast", label: "AST" },
    { id: "ir", label: "IR" },
    { id: "cfg", label: "CFG" },
    { id: "bytecode", label: "Bytecode" },
  ];

  return (
    <div className="bug-playground" style={{ height }}>
      <div className="bug-playground-header">
        <div className="bug-playground-controls">
          {showOptimizationSelector && (
            <label className="bug-playground-opt-control">
              <span>Optimization:</span>
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
          )}
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="bug-playground-compile-btn"
          >
            {isCompiling ? "Compiling..." : "Compile"}
          </button>
        </div>
      </div>

      <div className="bug-playground-content">
        <div className="bug-playground-editor">
          <Editor
            value={code}
            onChange={setCode}
            language="bug"
            highlightedRanges={highlightedRanges}
          />
        </div>

        <div className="bug-playground-output">
          {compileResult && !compileResult.success && (
            <div className="bug-playground-error">
              <h4>Compilation Error</h4>
              <pre>{compileResult.error}</pre>
            </div>
          )}

          {compileResult?.success && (
            <>
              <div className="bug-playground-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`bug-playground-tab ${
                      activeTab === tab.id ? "active" : ""
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="bug-playground-tab-content">
                {activeTab === "ast" && compileResult.ast && (
                  <AstView ast={compileResult.ast} />
                )}
                {activeTab === "ir" && compileResult.ir && (
                  <IrView
                    ir={compileResult.ir}
                    onOpcodeHover={handleOpcodeHover}
                  />
                )}
                {activeTab === "cfg" && compileResult.ir && (
                  <CfgView ir={compileResult.ir} />
                )}
                {activeTab === "bytecode" && compileResult.bytecode && (
                  <BytecodeView
                    bytecode={compileResult.bytecode}
                    onOpcodeHover={handleOpcodeHover}
                  />
                )}
              </div>
            </>
          )}

          {compileResult && compileResult.warnings.length > 0 && (
            <div className="bug-playground-warnings">
              <h4>Warnings</h4>
              <ul>
                {compileResult.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
