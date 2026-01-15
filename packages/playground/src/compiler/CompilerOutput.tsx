import { useState } from "react";
import type { CompileResult } from "./types";
import { AstView } from "../visualization/AstView";
import { IrView } from "../visualization/IrView";
import { CfgView } from "../visualization/CfgView";
import { BytecodeView } from "../visualization/BytecodeView";
import { ErrorView } from "./ErrorView";
import type { SourceRange } from "../visualization/debugUtils";
import "./CompilerOutput.css";

interface CompilerOutputProps {
  result: CompileResult;
  onOpcodeHover?: (ranges: SourceRange[]) => void;
}

type TabType = "ast" | "ir" | "cfg" | "bytecode" | "error";

export function CompilerOutput({ result, onOpcodeHover }: CompilerOutputProps) {
  const [activeTab, setActiveTab] = useState<TabType>(
    result.success ? "ast" : "error",
  );

  if (!result.success) {
    return <ErrorView error={result.error} warnings={result.warnings} />;
  }

  const tabs: { id: TabType; label: string; disabled?: boolean }[] = [
    { id: "ast", label: "AST" },
    { id: "ir", label: "IR" },
    { id: "cfg", label: "CFG" },
    { id: "bytecode", label: "Bytecode" },
  ];

  return (
    <div className="compiler-output">
      <div className="output-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`output-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.disabled}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="output-content">
        {activeTab === "ast" && <AstView ast={result.ast} />}
        {activeTab === "ir" && (
          <IrView ir={result.ir} onOpcodeHover={onOpcodeHover} />
        )}
        {activeTab === "cfg" && <CfgView ir={result.ir} />}
        {activeTab === "bytecode" && (
          <BytecodeView
            bytecode={result.bytecode}
            onOpcodeHover={onOpcodeHover}
          />
        )}
      </div>

      {result.warnings.length > 0 && (
        <div className="output-warnings">
          <h3>Warnings:</h3>
          <ul>
            {result.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
