/**
 * TraceViewer component for the Docusaurus site.
 *
 * Provides an interactive execution trace viewer with source highlighting.
 */

import React from "react";
import type { Program, Materials } from "@ethdebug/format";
import {
  TraceProvider,
  TraceControls,
  TraceProgress,
  VariableInspector,
  StackInspector,
  useTraceContext,
  type TraceStep,
} from "@ethdebug/programs-react";

// Import CSS for styling
import "./TraceViewer.css";
import "./TraceControls.css";
import "./VariableInspector.css";

export interface TraceViewerProps {
  /** The execution trace */
  trace: TraceStep[];
  /** The program definition */
  program: Program;
  /** Source materials for highlighting */
  sources?: Materials.Source[];
  /** Initial step index */
  initialStepIndex?: number;
  /** Whether to show variables panel */
  showVariables?: boolean;
  /** Whether to show stack panel */
  showStack?: boolean;
  /** Custom height */
  height?: string;
}

/**
 * Interactive execution trace viewer.
 */
export function TraceViewer({
  trace,
  program,
  sources = [],
  initialStepIndex = 0,
  showVariables = true,
  showStack = true,
  height,
}: TraceViewerProps): JSX.Element {
  return (
    <div className="trace-viewer" style={height ? { height } : undefined}>
      <TraceProvider
        trace={trace}
        program={program}
        initialStepIndex={initialStepIndex}
      >
        <TraceViewerContent
          sources={sources}
          showVariables={showVariables}
          showStack={showStack}
        />
      </TraceProvider>
    </div>
  );
}

interface TraceViewerContentProps {
  sources: Materials.Source[];
  showVariables: boolean;
  showStack: boolean;
}

function TraceViewerContent({
  sources,
  showVariables,
  showStack,
}: TraceViewerContentProps): JSX.Element {
  const { currentStep, currentInstruction } = useTraceContext();

  // Find source range for current instruction
  const sourceRange =
    currentInstruction?.context && "code" in currentInstruction.context
      ? currentInstruction.context.code
      : undefined;

  // Find the source content to display
  const sourceContent =
    sourceRange && sources.length > 0
      ? sources.find((s) => s.id === sourceRange.source.id)?.contents
      : sources[0]?.contents;

  return (
    <div className="trace-viewer-content">
      <div className="trace-viewer-header">
        <TraceControls showStepCount={true} showOpcode={true} />
        <TraceProgress />
      </div>

      <div className="trace-viewer-body">
        <div className="trace-viewer-left">
          {sourceContent && (
            <div className="trace-viewer-panel source-panel">
              <h4 className="panel-title">Source</h4>
              <SourceDisplay
                source={sourceContent}
                highlightRange={sourceRange?.range}
              />
            </div>
          )}

          <div className="trace-viewer-panel opcodes-panel">
            <h4 className="panel-title">Instructions</h4>
            <OpcodeList program={program} currentPc={currentStep?.pc} />
          </div>
        </div>

        <div className="trace-viewer-right">
          {showVariables && (
            <div className="trace-viewer-panel variables-panel">
              <h4 className="panel-title">Variables</h4>
              <VariableInspector showTypes={true} />
            </div>
          )}

          {showStack && (
            <div className="trace-viewer-panel stack-panel">
              <h4 className="panel-title">Stack</h4>
              <StackInspector maxEntries={8} />
            </div>
          )}

          {currentStep?.storage &&
            Object.keys(currentStep.storage).length > 0 && (
              <div className="trace-viewer-panel storage-panel">
                <h4 className="panel-title">Storage</h4>
                <StorageDisplay storage={currentStep.storage} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

interface SourceDisplayProps {
  source: string;
  highlightRange?: { offset: number; length: number };
}

function SourceDisplay({
  source,
  highlightRange,
}: SourceDisplayProps): JSX.Element {
  if (!highlightRange) {
    return <pre className="source-code">{source}</pre>;
  }

  const { offset, length } = highlightRange;
  const before = source.slice(0, offset);
  const highlighted = source.slice(offset, offset + length);
  const after = source.slice(offset + length);

  return (
    <pre className="source-code">
      {before}
      <mark className="source-highlight">{highlighted}</mark>
      {after}
    </pre>
  );
}

interface OpcodeListProps {
  program: Program;
  currentPc?: number;
}

function OpcodeList({ program, currentPc }: OpcodeListProps): JSX.Element {
  const instructions = program.instructions || [];

  return (
    <div className="opcode-list">
      {instructions.map((instr) => {
        const isActive = instr.offset === currentPc;
        const offset = `0x${instr.offset.toString(16).padStart(4, "0")}`;
        const mnemonic = instr.operation?.mnemonic || "???";
        const args = instr.operation?.arguments?.join(" ") || "";

        return (
          <div
            key={instr.offset}
            className={`opcode-item ${isActive ? "active" : ""}`}
          >
            <span className="opcode-offset">{offset}</span>
            <span className="opcode-mnemonic">{mnemonic}</span>
            {args && <span className="opcode-args">{args}</span>}
          </div>
        );
      })}
    </div>
  );
}

interface StorageDisplayProps {
  storage: Record<string, string>;
}

function StorageDisplay({ storage }: StorageDisplayProps): JSX.Element {
  const entries = Object.entries(storage);

  return (
    <div className="storage-list">
      {entries.map(([slot, value]) => (
        <div key={slot} className="storage-entry">
          <span className="storage-slot">{slot}</span>
          <span className="storage-arrow">=</span>
          <code className="storage-value">{value}</code>
        </div>
      ))}
    </div>
  );
}
