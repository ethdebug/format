/**
 * Trace Drawer - A pull-out drawer for compiling and tracing BUG code.
 *
 * Features:
 * - BUG code editor
 * - Compiles via @ethdebug/bugc
 * - Executes via @ethdebug/evm
 * - Step-through trace visualization
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { compile as bugCompile, Severity, type Evm } from "@ethdebug/bugc";
import {
  Editor,
  type BytecodeOutput,
  type SourceRange,
  extractSourceRange,
} from "@ethdebug/bugc-react";
import { Executor, createTraceCollector, type TraceStep } from "@ethdebug/evm";
import { dereference, Data, type Machine } from "@ethdebug/pointers";
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

  // Extract call info from current instruction context
  const currentCallInfo = useMemo(() => {
    if (trace.length === 0 || currentStep >= trace.length) {
      return undefined;
    }

    const step = trace[currentStep];
    const instruction = pcToInstruction.get(step.pc);
    if (!instruction?.debug?.context) return undefined;

    return extractCallInfo(instruction.debug.context);
  }, [trace, currentStep, pcToInstruction]);

  // Build call stack by scanning invoke/return/revert up to
  // current step
  const callStack = useMemo(() => {
    const frames: Array<{
      identifier?: string;
      stepIndex: number;
      callType?: string;
      argumentNames?: string[];
      argumentPointers?: unknown[];
    }> = [];

    for (let i = 0; i <= currentStep && i < trace.length; i++) {
      const step = trace[i];
      const instruction = pcToInstruction.get(step.pc);
      if (!instruction?.debug?.context) continue;

      const info = extractCallInfo(instruction.debug.context);
      if (!info) continue;

      if (info.kind === "invoke") {
        // The compiler emits invoke on both the caller
        // JUMP and callee entry JUMPDEST for the same
        // call. These occur on consecutive trace steps.
        // Only skip if the top frame matches AND was
        // pushed on the immediately preceding step —
        // otherwise this is a new call (e.g. recursion).
        const top = frames[frames.length - 1];
        const isDuplicate =
          top &&
          top.identifier === info.identifier &&
          top.callType === info.callType &&
          top.stepIndex === i - 1;
        if (isDuplicate) {
          // Use the callee entry step for resolution —
          // argument pointers reference stack slots
          // valid at the JUMPDEST, not the JUMP.
          // Argument names also live on the callee entry.
          top.stepIndex = i;
          top.argumentNames = info.argumentNames ?? top.argumentNames;
          top.argumentPointers = info.argumentPointers;
        } else {
          frames.push({
            identifier: info.identifier,
            stepIndex: i,
            callType: info.callType,
            argumentNames: info.argumentNames,
            argumentPointers: info.argumentPointers,
          });
        }
      } else if (info.kind === "return" || info.kind === "revert") {
        if (frames.length > 0) {
          frames.pop();
        }
      }
    }

    return frames;
  }, [trace, currentStep, pcToInstruction]);

  // Resolve argument values for call stack frames
  const argCacheRef = useRef<Map<number, ResolvedArg[]>>(new Map());

  const [resolvedArgs, setResolvedArgs] = useState<Map<number, ResolvedArg[]>>(
    new Map(),
  );

  useEffect(() => {
    if (callStack.length === 0) {
      setResolvedArgs(new Map());
      return;
    }

    // Initialize with cached values
    const initial = new Map<number, ResolvedArg[]>();
    for (const frame of callStack) {
      const cached = argCacheRef.current.get(frame.stepIndex);
      if (cached) {
        initial.set(frame.stepIndex, cached);
      }
    }
    setResolvedArgs(new Map(initial));

    let cancelled = false;

    const promises = callStack.map(async (frame) => {
      if (argCacheRef.current.has(frame.stepIndex)) {
        return;
      }

      const ptrs = frame.argumentPointers;
      const names = frame.argumentNames;
      if (!ptrs || ptrs.length === 0) return;

      const step = trace[frame.stepIndex];
      if (!step) return;

      const state = traceStepToState(step, storage);
      const args: ResolvedArg[] = ptrs.map((_, i) => ({
        name: names?.[i] ?? `_${i}`,
      }));

      const resolvePromises = ptrs.map(async (ptr, i) => {
        try {
          const value = await resolvePointer(ptr, state);
          args[i] = { ...args[i], value };
        } catch (err) {
          args[i] = {
            ...args[i],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

      await Promise.all(resolvePromises);

      if (!cancelled) {
        argCacheRef.current.set(frame.stepIndex, args);
        setResolvedArgs((prev) => {
          const next = new Map(prev);
          next.set(frame.stepIndex, args);
          return next;
        });
      }
    });

    Promise.all(promises).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [callStack, trace, storage]);

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

  const rangeKey = (stepIdx: number): string => {
    const step = trace[stepIdx];
    if (!step) return "";
    const instr = pcToInstruction.get(step.pc);
    if (!instr?.debug?.context) return "";
    const ranges = extractSourceRange(instr.debug.context);
    if (ranges.length === 0) return "";
    return ranges.map((r) => `${r.offset}:${r.length}`).join(",");
  };

  const stepToNextSource = () => {
    setCurrentStep((prev) => {
      const currentKey = rangeKey(prev);
      for (let i = prev + 1; i < trace.length; i++) {
        const key = rangeKey(i);
        if (key !== currentKey && key !== "") return i;
      }
      return trace.length - 1;
    });
  };

  const stepToPrevSource = () => {
    setCurrentStep((prev) => {
      const currentKey = rangeKey(prev);
      let i = prev - 1;
      while (i > 0) {
        const key = rangeKey(i);
        if (key !== currentKey && key !== "") break;
        i--;
      }
      const targetKey = rangeKey(i);
      while (i > 0) {
        if (rangeKey(i - 1) !== targetKey) break;
        i--;
      }
      return Math.max(0, i);
    });
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
                  onClick={stepToPrevSource}
                  disabled={currentStep === 0}
                  className="trace-nav-btn"
                  title="Previous source location"
                >
                  &#x25C0;
                </button>
                <button
                  onClick={stepBackward}
                  disabled={currentStep === 0}
                  className="trace-nav-btn trace-nav-btn-step"
                  title="Previous trace step"
                >
                  &#x25C1;
                </button>
                <span className="trace-step-info">
                  {currentStep + 1} / {trace.length}
                </span>
                <button
                  onClick={stepForward}
                  disabled={currentStep >= trace.length - 1}
                  className="trace-nav-btn trace-nav-btn-step"
                  title="Next trace step"
                >
                  &#x25B7;
                </button>
                <button
                  onClick={stepToNextSource}
                  disabled={currentStep >= trace.length - 1}
                  className="trace-nav-btn"
                  title="Next source location"
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

              <div className="call-stack-bar">
                <span className="call-stack-label">Call Stack:</span>
                {callStack.length === 0 ? (
                  <span className="call-stack-toplevel">(top level)</span>
                ) : (
                  callStack.map((frame, i) => (
                    <React.Fragment key={frame.stepIndex}>
                      {i > 0 && (
                        <span className="call-stack-sep">&#x203A;</span>
                      )}
                      <button
                        className="call-stack-frame-btn"
                        onClick={() => setCurrentStep(frame.stepIndex)}
                        type="button"
                      >
                        {frame.identifier || "(anonymous)"}(
                        {formatFrameArgs(frame, resolvedArgs)})
                      </button>
                    </React.Fragment>
                  ))
                )}
              </div>

              {currentCallInfo && (
                <div
                  className={`call-info-bar call-info-${currentCallInfo.kind}`}
                >
                  {formatCallBanner(currentCallInfo)}
                </div>
              )}

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
 * Info about a call context (invoke/return/revert).
 */
interface CallInfoResult {
  kind: "invoke" | "return" | "revert";
  identifier?: string;
  callType?: string;
  argumentNames?: string[];
  argumentPointers?: unknown[];
}

/**
 * Extract call info from an ethdebug format context object.
 */
function extractCallInfo(context: unknown): CallInfoResult | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const ctx = context as Record<string, unknown>;

  if ("invoke" in ctx && ctx.invoke) {
    const inv = ctx.invoke as Record<string, unknown>;
    let callType: string | undefined;
    if ("jump" in inv) callType = "internal";
    else if ("message" in inv) callType = "external";
    else if ("create" in inv) callType = "create";

    const argInfo = extractArgInfoFromInvoke(inv);
    return {
      kind: "invoke",
      identifier: inv.identifier as string | undefined,
      callType,
      argumentNames: argInfo?.names,
      argumentPointers: argInfo?.pointers,
    };
  }

  if ("return" in ctx && ctx.return) {
    const ret = ctx.return as Record<string, unknown>;
    return {
      kind: "return",
      identifier: ret.identifier as string | undefined,
    };
  }

  if ("revert" in ctx && ctx.revert) {
    const rev = ctx.revert as Record<string, unknown>;
    return {
      kind: "revert",
      identifier: rev.identifier as string | undefined,
    };
  }

  // Walk gather/pick
  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    for (const sub of ctx.gather) {
      const info = extractCallInfo(sub);
      if (info) return info;
    }
  }

  if ("pick" in ctx && Array.isArray(ctx.pick)) {
    for (const sub of ctx.pick) {
      const info = extractCallInfo(sub);
      if (info) return info;
    }
  }

  return undefined;
}

/**
 * Format a call info banner string.
 */
function formatCallBanner(info: CallInfoResult): string {
  const name = info.identifier || "(anonymous)";
  const params = info.argumentNames
    ? `(${info.argumentNames.join(", ")})`
    : "()";
  switch (info.kind) {
    case "invoke": {
      const prefix = info.callType === "create" ? "Creating" : "Calling";
      return `${prefix} ${name}${params}`;
    }
    case "return":
      return `Returned from ${name}()`;
    case "revert":
      return `Reverted in ${name}()`;
  }
}

function extractArgInfoFromInvoke(
  inv: Record<string, unknown>,
): { names?: string[]; pointers?: unknown[] } | undefined {
  const args = inv.arguments as Record<string, unknown> | undefined;
  if (!args) return undefined;

  const pointer = args.pointer as Record<string, unknown> | undefined;
  if (!pointer) return undefined;

  const group = pointer.group as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(group)) return undefined;

  const names: string[] = [];
  const pointers: unknown[] = [];
  let hasAnyName = false;
  for (const entry of group) {
    const name = entry.name as string | undefined;
    if (name) {
      names.push(name);
      hasAnyName = true;
    } else {
      names.push("_");
    }
    pointers.push(entry);
  }

  return {
    names: hasAnyName ? names : undefined,
    pointers,
  };
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

function formatFrameArgs(
  frame: {
    stepIndex: number;
    argumentNames?: string[];
  },
  resolved: Map<number, ResolvedArg[]>,
): string {
  const args = resolved.get(frame.stepIndex);
  if (!args) {
    return frame.argumentNames ? frame.argumentNames.join(", ") : "";
  }
  return args
    .map((arg) => {
      if (arg.value === undefined) return arg.name;
      const decimal = formatAsDecimal(arg.value);
      return `${arg.name}: ${decimal}`;
    })
    .join(", ");
}

function formatAsDecimal(hex: string): string {
  try {
    const n = BigInt(hex);
    if (n <= 9999n) return n.toString();
    return hex;
  } catch {
    return hex;
  }
}

/**
 * Convert an evm TraceStep + storage into a Machine.State
 * for pointer dereferencing.
 */
function traceStepToState(
  step: TraceStep,
  storage: Record<string, string>,
): Machine.State {
  const stackEntries = step.stack.map((v) =>
    Data.fromUint(v).padUntilAtLeast(32),
  );

  const memoryData = step.memory ? Data.fromBytes(step.memory) : Data.zero();

  const storageMap = new Map<string, Data>();
  for (const [slot, value] of Object.entries(storage)) {
    const key = Data.fromHex(slot).padUntilAtLeast(32).toHex();
    storageMap.set(key, Data.fromHex(value).padUntilAtLeast(32));
  }

  const stack: Machine.State.Stack = {
    get length() {
      return Promise.resolve(BigInt(stackEntries.length));
    },
    async peek({ depth, slice }) {
      const index = stackEntries.length - 1 - Number(depth);
      if (index < 0 || index >= stackEntries.length) {
        throw new Error(`Stack underflow: depth ${depth}`);
      }
      const entry = stackEntries[index];
      if (!slice) return entry;
      const { offset, length } = slice;
      return Data.fromBytes(
        entry.slice(Number(offset), Number(offset + length)),
      );
    },
  };

  const makeBytesReader = (data: Data): Machine.State.Bytes => ({
    get length() {
      return Promise.resolve(BigInt(data.length));
    },
    async read({ slice }) {
      const { offset, length } = slice;
      const start = Number(offset);
      const end = start + Number(length);
      if (end > data.length) {
        const result = new Uint8Array(Number(length));
        const available = Math.max(0, data.length - start);
        if (available > 0 && start < data.length) {
          result.set(data.slice(start, start + available), 0);
        }
        return Data.fromBytes(result);
      }
      return Data.fromBytes(data.slice(start, end));
    },
  });

  const storageReader: Machine.State.Words = {
    async read({ slot, slice }) {
      const key = slot.padUntilAtLeast(32).toHex();
      const value = storageMap.get(key) || Data.zero().padUntilAtLeast(32);
      if (!slice) return value;
      const { offset, length } = slice;
      return Data.fromBytes(
        value.slice(Number(offset), Number(offset + length)),
      );
    },
  };

  const emptyWords: Machine.State.Words = {
    async read({ slice }) {
      const value = Data.zero().padUntilAtLeast(32);
      if (!slice) return value;
      const { offset, length } = slice;
      return Data.fromBytes(
        value.slice(Number(offset), Number(offset + length)),
      );
    },
  };

  return {
    get traceIndex() {
      return Promise.resolve(0n);
    },
    get programCounter() {
      return Promise.resolve(BigInt(step.pc));
    },
    get opcode() {
      return Promise.resolve(step.opcode);
    },
    stack,
    memory: makeBytesReader(memoryData),
    storage: storageReader,
    calldata: makeBytesReader(Data.zero()),
    returndata: makeBytesReader(Data.zero()),
    code: makeBytesReader(Data.zero()),
    transient: emptyWords,
  };
}

/**
 * Resolve a single pointer against a machine state.
 */
async function resolvePointer(
  pointer: unknown,
  state: Machine.State,
): Promise<string> {
  const cursor = await dereference(
    pointer as Parameters<typeof dereference>[0],
    { state, templates: {} },
  );
  const view = await cursor.view(state);

  const values: Data[] = [];
  for (const region of view.regions) {
    values.push(await view.read(region));
  }

  if (values.length === 0) return "0x";
  if (values.length === 1) return values[0].toHex();
  return values.map((d) => d.toHex()).join(", ");
}

interface ResolvedArg {
  name: string;
  value?: string;
  error?: string;
}

export default TraceDrawer;
