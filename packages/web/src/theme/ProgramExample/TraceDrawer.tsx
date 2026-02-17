/**
 * Trace Drawer - A pull-out drawer for compiling and tracing BUG code.
 *
 * Features:
 * - BUG code editor
 * - Compiles via @ethdebug/bugc
 * - Executes via @ethdebug/evm
 * - Step-through trace visualization
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { compile as bugCompile, Severity, type Evm } from "@ethdebug/bugc";
import {
  Editor,
  type BytecodeOutput,
  type SourceRange,
  extractSourceRange,
} from "@ethdebug/bugc-react";
import { Executor, createTraceCollector, type TraceStep } from "@ethdebug/evm";
import { Drawer } from "@theme/Drawer";
import { useTracePlayground } from "./TracePlaygroundContext";

import "./TraceDrawer.css";

export function TraceDrawer(): JSX.Element {
  return (
    <BrowserOnly fallback={null}>{() => <TraceDrawerContent />}</BrowserOnly>
  );
}

interface CompileResult {
  success: boolean;
  error?: string;
  bytecode?: BytecodeOutput;
}

function TraceDrawerContent(): JSX.Element {
  const { example, isOpen, toggleDrawer, closeDrawer, setSource } =
    useTracePlayground();

  const [source, setLocalSource] = useState(example?.source ?? "");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(
    null,
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isTracing, setIsTracing] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [storage, setStorage] = useState<Record<string, string>>({});

  // Build PC -> instruction map for source highlighting
  const pcToInstruction = useMemo(() => {
    const map = new Map<number, Evm.Instruction>();
    if (!compileResult?.bytecode?.runtimeInstructions) return map;

    let pc = 0;
    for (const instruction of compileResult.bytecode.runtimeInstructions) {
      map.set(pc, instruction);
      pc += 1 + (instruction.immediates?.length || 0);
    }
    return map;
  }, [compileResult?.bytecode?.runtimeInstructions]);

  // Get highlighted source ranges for current trace step
  const highlightedRanges = useMemo((): SourceRange[] => {
    if (trace.length === 0 || currentStep >= trace.length) return [];

    const step = trace[currentStep];
    const instruction = pcToInstruction.get(step.pc);
    if (!instruction?.debug?.context) return [];

    return extractSourceRange(instruction.debug.context);
  }, [trace, currentStep, pcToInstruction]);

  // Extract variables from current instruction context
  const currentVariables = useMemo(() => {
    if (trace.length === 0 || currentStep >= trace.length) return [];

    const step = trace[currentStep];
    const instruction = pcToInstruction.get(step.pc);
    if (!instruction?.debug?.context) return [];

    return extractVariables(instruction.debug.context);
  }, [trace, currentStep, pcToInstruction]);

  // Compile source and run trace in one shot.
  // Takes source directly to avoid stale-state issues.
  const compileAndTrace = useCallback(async (sourceCode: string) => {
    setIsCompiling(true);
    setCompileResult(null);
    setTrace([]);
    setCurrentStep(0);
    setTraceError(null);
    setStorage({});

    let bytecode: BytecodeOutput | undefined;

    try {
      const result = await bugCompile({
        to: "bytecode",
        source: sourceCode,
        optimizer: { level: 0 },
      });

      if (!result.success) {
        const errors = result.messages[Severity.Error] || [];
        setCompileResult({
          success: false,
          error: errors[0]?.message || "Compilation failed",
        });
        return;
      }

      bytecode = {
        runtime: result.value.bytecode.runtime,
        create: result.value.bytecode.create,
        runtimeInstructions: result.value.bytecode.runtimeInstructions,
        createInstructions: result.value.bytecode.createInstructions,
      };

      setCompileResult({ success: true, bytecode });
    } catch (e) {
      setCompileResult({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    } finally {
      setIsCompiling(false);
    }

    if (!bytecode) return;

    setIsTracing(true);

    try {
      const executor = new Executor();

      if (bytecode.create) {
        const createHex = Array.from(bytecode.create)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        await executor.deploy(createHex);
      }

      const [handler, getTrace] = createTraceCollector();
      await executor.execute({}, handler);

      const collectedTrace = getTrace();
      setTrace(collectedTrace.steps);
      setCurrentStep(0);

      const storageEntries: Record<string, string> = {};
      for (let i = 0n; i < 16n; i++) {
        const value = await executor.getStorage(i);
        if (value !== 0n) {
          const slot = `0x${i.toString(16).padStart(2, "0")}`;
          storageEntries[slot] = `0x${value.toString(16).padStart(64, "0")}`;
        }
      }
      setStorage(storageEntries);
    } catch (e) {
      setTraceError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsTracing(false);
    }
  }, []);

  // Auto compile+trace when a new example is loaded
  useEffect(() => {
    if (example?.source) {
      setLocalSource(example.source);
      compileAndTrace(example.source);
    }
  }, [example, compileAndTrace]);

  const handleSourceChange = useCallback(
    (newSource: string) => {
      setLocalSource(newSource);
      setSource(newSource);
    },
    [setSource],
  );

  const handleCompileAndTrace = useCallback(() => {
    compileAndTrace(source);
  }, [source, compileAndTrace]);

  const stepForward = () => {
    setCurrentStep((prev) => Math.min(prev + 1, trace.length - 1));
  };

  const stepBackward = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const jumpToStart = () => setCurrentStep(0);
  const jumpToEnd = () => setCurrentStep(trace.length - 1);

  const currentTraceStep = trace[currentStep];
  const hasTrace = trace.length > 0;
  const isBusy = isCompiling || isTracing;

  const headerActions = (
    <button
      className="trace-drawer-btn trace-btn"
      onClick={handleCompileAndTrace}
      disabled={isBusy || !source.trim()}
      type="button"
    >
      {isCompiling
        ? "Compiling..."
        : isTracing
          ? "Running..."
          : "Compile & Run"}
    </button>
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={closeDrawer}
      onToggle={toggleDrawer}
      title={example?.title || "Trace Playground"}
      headerActions={headerActions}
      className="trace-drawer"
    >
      <div className="trace-drawer-layout">
        {/* Left: Editor */}
        <div className="trace-drawer-editor">
          <Editor
            value={source}
            onChange={handleSourceChange}
            language="bug"
            highlightedRanges={highlightedRanges}
          />
        </div>

        {/* Right: Output */}
        <div className="trace-drawer-output">
          {compileResult && !compileResult.success && (
            <div className="trace-drawer-error">
              <strong>Compile Error:</strong> {compileResult.error}
            </div>
          )}

          {traceError && (
            <div className="trace-drawer-error">
              <strong>Trace Error:</strong> {traceError}
            </div>
          )}

          {!hasTrace && isBusy && (
            <div className="trace-drawer-placeholder">
              {isCompiling ? "Compiling..." : "Running trace..."}
            </div>
          )}

          {hasTrace && (
            <div className="trace-viewer">
              <div className="trace-controls">
                <button
                  onClick={jumpToStart}
                  disabled={currentStep === 0}
                  className="trace-nav-btn"
                  title="Jump to start"
                >
                  &#x23EE;
                </button>
                <button
                  onClick={stepBackward}
                  disabled={currentStep === 0}
                  className="trace-nav-btn"
                  title="Step backward"
                >
                  &#x25C0;
                </button>
                <span className="trace-step-info">
                  {currentStep + 1} / {trace.length}
                </span>
                <button
                  onClick={stepForward}
                  disabled={currentStep >= trace.length - 1}
                  className="trace-nav-btn"
                  title="Step forward"
                >
                  &#x25B6;
                </button>
                <button
                  onClick={jumpToEnd}
                  disabled={currentStep >= trace.length - 1}
                  className="trace-nav-btn"
                  title="Jump to end"
                >
                  &#x23ED;
                </button>
              </div>

              <div className="trace-panels">
                <div className="trace-panel opcodes-panel">
                  <div className="panel-header">Instructions</div>
                  <OpcodeList
                    trace={trace}
                    currentStep={currentStep}
                    onStepClick={setCurrentStep}
                  />
                </div>

                <div className="trace-panel state-panel">
                  {currentTraceStep && (
                    <>
                      <div className="current-opcode">
                        <code>{currentTraceStep.opcode}</code>
                        <span className="opcode-pc">
                          @ 0x{currentTraceStep.pc.toString(16)}
                        </span>
                      </div>

                      <div className="panel-header">Stack</div>
                      <StackDisplay stack={currentTraceStep.stack} />

                      {currentVariables.length > 0 && (
                        <>
                          <div className="panel-header">Variables</div>
                          <VariablesDisplay variables={currentVariables} />
                        </>
                      )}

                      {Object.keys(storage).length > 0 && (
                        <>
                          <div className="panel-header">Storage</div>
                          <StorageDisplay storage={storage} />
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

interface OpcodeListProps {
  trace: TraceStep[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

function OpcodeList({
  trace,
  currentStep,
  onStepClick,
}: OpcodeListProps): JSX.Element {
  // Show a window around the current step
  const windowSize = 8;
  const start = Math.max(0, currentStep - windowSize);
  const end = Math.min(trace.length, currentStep + windowSize + 1);
  const visibleSteps = trace.slice(start, end);

  return (
    <div className="opcode-list">
      {start > 0 && <div className="opcode-ellipsis">... {start} above</div>}
      {visibleSteps.map((step, i) => {
        const index = start + i;
        const isActive = index === currentStep;
        return (
          <div
            key={index}
            className={`opcode-item ${isActive ? "active" : ""}`}
            onClick={() => onStepClick(index)}
          >
            <span className="opcode-index">{index + 1}</span>
            <span className="opcode-pc">
              0x{step.pc.toString(16).padStart(4, "0")}
            </span>
            <code className="opcode-name">{step.opcode}</code>
          </div>
        );
      })}
      {end < trace.length && (
        <div className="opcode-ellipsis">... {trace.length - end} below</div>
      )}
    </div>
  );
}

interface StackDisplayProps {
  stack: bigint[];
}

function StackDisplay({ stack }: StackDisplayProps): JSX.Element {
  if (stack.length === 0) {
    return <div className="stack-empty">(empty)</div>;
  }

  return (
    <div className="stack-list">
      {stack.slice(0, 6).map((value, i) => (
        <div key={i} className="stack-item">
          <span className="stack-index">[{i}]</span>
          <code className="stack-value">{formatBigInt(value)}</code>
        </div>
      ))}
      {stack.length > 6 && (
        <div className="stack-item stack-more">... {stack.length - 6} more</div>
      )}
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
        <div key={slot} className="storage-item">
          <span className="storage-slot">{slot}</span>
          <span className="storage-arrow">&#x2192;</span>
          <code className="storage-value">
            {value.length > 18 ? value.slice(0, 18) + "..." : value}
          </code>
        </div>
      ))}
    </div>
  );
}

function formatBigInt(value: bigint): string {
  const hex = value.toString(16);
  if (hex.length <= 8) {
    return `0x${hex}`;
  }
  return `0x${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

// Variable type extracted from debug context
interface Variable {
  identifier: string;
  type?: string;
}

interface VariablesDisplayProps {
  variables: Variable[];
}

function VariablesDisplay({ variables }: VariablesDisplayProps): JSX.Element {
  return (
    <div className="variables-list">
      {variables.map((variable, i) => (
        <div key={i} className="variable-item">
          <span className="variable-name">{variable.identifier}</span>
          {variable.type && (
            <span className="variable-type">{variable.type}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Extract variables from an ethdebug format context object.
 */
function extractVariables(context: unknown): Variable[] {
  if (!context || typeof context !== "object") {
    return [];
  }

  const ctx = context as Record<string, unknown>;
  const variables: Variable[] = [];

  // Handle direct variables array
  if (ctx.variables && Array.isArray(ctx.variables)) {
    for (const v of ctx.variables) {
      if (v && typeof v === "object" && "identifier" in v) {
        const variable = v as Record<string, unknown>;
        variables.push({
          identifier: String(variable.identifier),
          type: variable.type ? formatType(variable.type) : undefined,
        });
      }
    }
  }

  // Handle "gather" context
  if (ctx.gather && Array.isArray(ctx.gather)) {
    for (const item of ctx.gather) {
      variables.push(...extractVariables(item));
    }
  }

  // Handle "frame" context
  if (ctx.frame && typeof ctx.frame === "object") {
    variables.push(...extractVariables(ctx.frame));
  }

  // Handle nested context
  if (ctx.context) {
    variables.push(...extractVariables(ctx.context));
  }

  return variables;
}

/**
 * Format a type definition for display.
 */
function formatType(type: unknown): string {
  if (!type || typeof type !== "object") {
    return String(type);
  }

  const t = type as Record<string, unknown>;

  if (t.kind === "uint" && typeof t.bits === "number") {
    return `uint${t.bits}`;
  }
  if (t.kind === "int" && typeof t.bits === "number") {
    return `int${t.bits}`;
  }
  if (t.kind === "bool") {
    return "bool";
  }
  if (t.kind === "address") {
    return "address";
  }
  if (t.kind === "bytes" && typeof t.size === "number") {
    return `bytes${t.size}`;
  }

  return JSON.stringify(type);
}

export default TraceDrawer;
