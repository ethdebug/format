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
import {
  buildCallStack,
  extractCallInfoFromInstruction,
  extractTransformFromInstruction,
  type CallFrame,
  type CallInfo,
  type TraceStep as ProgramsTraceStep,
} from "@ethdebug/programs-react";
import type { Program } from "@ethdebug/format";
import { Drawer } from "@theme/Drawer";
import { useTracePlayground } from "./TracePlaygroundContext";

import "./TraceDrawer.css";

// Bounds for the draggable instruction-object footer (in px).
const OBJECT_MIN_HEIGHT = 80;
const OBJECT_DEFAULT_HEIGHT = 180;
// Vertical space kept for the controls + instructions/state row so the
// footer can never grow to swallow the whole drawer.
const OBJECT_ROW_RESERVE = 160;

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

/** bugc optimizer levels the tracer can compile at. */
type OptLevel = 0 | 1 | 2 | 3;
const OPT_LEVELS: readonly OptLevel[] = [0, 1, 2, 3];
const OPT_LEVEL_TITLES: Record<OptLevel, string> = {
  0: "No optimization",
  1: "Level 1 — constant folding, propagation, dead-code elimination",
  2: "Level 2 — adds CSE, tail-call optimization, jump optimization",
  3: "Level 3 — adds block/return/read-write merging",
};

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
  const [showInstructionObject, setShowInstructionObject] = useState(false);
  const [objectHeight, setObjectHeight] = useState(OBJECT_DEFAULT_HEIGHT);
  const [isResizingObject, setIsResizingObject] = useState(false);

  // Refs for the draggable instruction-object footer
  const viewerRef = useRef<HTMLDivElement>(null);
  const objectDragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );

  // Clamp the footer height so it keeps a minimum while leaving room for
  // the controls + instructions/state row above it.
  const clampObjectHeight = useCallback((height: number): number => {
    const viewer = viewerRef.current;
    const max = viewer
      ? Math.max(OBJECT_MIN_HEIGHT, viewer.clientHeight - OBJECT_ROW_RESERVE)
      : Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(OBJECT_MIN_HEIGHT, height));
  }, []);

  const handleObjectResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      objectDragRef.current = { startY: e.clientY, startHeight: objectHeight };
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsResizingObject(true);
    },
    [objectHeight],
  );

  const handleObjectResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = objectDragRef.current;
      if (!drag) return;
      // Dragging up (clientY decreases) grows the object pane.
      const next = drag.startHeight + (drag.startY - e.clientY);
      setObjectHeight(clampObjectHeight(next));
    },
    [clampObjectHeight],
  );

  const handleObjectResizeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!objectDragRef.current) return;
      objectDragRef.current = null;
      setIsResizingObject(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [],
  );

  // Re-clamp the footer height when the drawer/viewer is resized, so
  // shrinking the drawer shrinks the footer rather than collapsing the
  // instructions/state row. Keyed on trace length so it re-attaches when
  // the viewer element mounts.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setObjectHeight((h) => clampObjectHeight(h));
    });
    observer.observe(viewer);
    return () => observer.disconnect();
  }, [trace.length, clampObjectHeight]);

  // Optimizer level the tracer compiles at. Readers flip
  // 0 ↔ 2 to watch optimizer transforms (e.g. the tailcall
  // annotation on TCO back-edges) appear. A ref mirrors it
  // so the example-load effect can read the current value
  // without re-running when only the level changes.
  const [optimizerLevel, setOptimizerLevel] = useState<OptLevel>(0);
  const optimizerLevelRef = useRef<OptLevel>(optimizerLevel);
  optimizerLevelRef.current = optimizerLevel;

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

  // Adapt the bugc instruction map + evm trace to the shared
  // programs-react call-stack helpers, which read the
  // ethdebug format shape (instruction.context) and a {pc}
  // trace. This lets the drawer reuse the same tailcall-aware
  // buildCallStack as the standalone TraceViewer instead of
  // duplicating the logic.
  const formatPcToInstruction = useMemo(() => {
    const m = new Map<number, Program.Instruction>();
    for (const [pc, inst] of pcToInstruction) {
      m.set(pc, {
        offset: pc,
        context: inst.debug?.context,
      } as unknown as Program.Instruction);
    }
    return m;
  }, [pcToInstruction]);

  const programsTrace = useMemo<ProgramsTraceStep[]>(
    () => trace.map((s) => ({ pc: s.pc, opcode: s.opcode })),
    [trace],
  );

  const currentInstruction = useMemo(() => {
    const step = trace[currentStep];
    if (!step) return undefined;
    return formatPcToInstruction.get(step.pc);
  }, [trace, currentStep, formatPcToInstruction]);

  // Extract call info from current instruction context
  const currentCallInfo = useMemo<CallInfo | undefined>(() => {
    if (!currentInstruction) return undefined;
    return extractCallInfoFromInstruction(currentInstruction);
  }, [currentInstruction]);

  // Build the ethdebug/format instruction object for the current step
  const currentFormatInstruction = useMemo(() => {
    if (trace.length === 0 || currentStep >= trace.length) return undefined;

    const step = trace[currentStep];
    const instruction = pcToInstruction.get(step.pc);
    if (!instruction) return undefined;

    return toFormatInstruction(instruction, step.pc);
  }, [trace, currentStep, pcToInstruction]);

  // Compiler transform tags on the current instruction
  // (e.g. "tailcall"), for the transform annotations panel.
  const currentTransforms = useMemo<string[]>(() => {
    if (!currentInstruction) return [];
    return extractTransformFromInstruction(currentInstruction);
  }, [currentInstruction]);

  // Build call stack via the shared, tailcall-aware helper.
  const callStack = useMemo<CallFrame[]>(
    () => buildCallStack(programsTrace, formatPcToInstruction, currentStep),
    [programsTrace, formatPcToInstruction, currentStep],
  );

  // Compiler transform tags per trace step, so the instruction list can
  // mark which instructions the optimizer rewrote (e.g. the spliced
  // instructions of an inlined body) without stepping onto each one.
  const transformsByStep = useMemo<string[][]>(
    () =>
      trace.map((s) => {
        const fi = formatPcToInstruction.get(s.pc);
        return fi ? extractTransformFromInstruction(fi) : [];
      }),
    [trace, formatPcToInstruction],
  );

  // Function-call boundaries per trace step, so the instruction list can
  // mark calls with a lightweight badge in the same visual language as the
  // transform tags. Consecutive identical boundaries are de-duplicated —
  // the compiler emits invoke on both the caller JUMP and the callee entry
  // JUMPDEST, which would otherwise badge two rows in a row.
  const callBadgeByStep = useMemo<(CallBadge | null)[]>(() => {
    let prevKey = "";
    return trace.map((s) => {
      const fi = formatPcToInstruction.get(s.pc);
      const info = fi ? extractCallInfoFromInstruction(fi) : undefined;
      if (!info || (info.kind !== "invoke" && info.kind !== "return")) {
        prevKey = "";
        return null;
      }
      const key = `${info.kind}:${info.identifier ?? ""}`;
      if (key === prevKey) return null;
      prevKey = key;
      return { kind: info.kind, id: info.identifier };
    });
  }, [trace, formatPcToInstruction]);

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

  // Resolve the current instruction's variable values by
  // dereferencing each variable's pointer against the step
  // state (reuses the same machinery as argument resolution).
  const [resolvedVarValues, setResolvedVarValues] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    const step = trace[currentStep];
    if (!step || currentVariables.length === 0) {
      setResolvedVarValues(new Map());
      return;
    }

    let cancelled = false;
    const state = traceStepToState(step, storage);
    const next = new Map<string, string>();

    Promise.all(
      currentVariables.map(async (v) => {
        if (!v.pointer) return;
        try {
          next.set(v.identifier, await resolvePointer(v.pointer, state));
        } catch {
          // leave unresolved
        }
      }),
    ).then(() => {
      if (!cancelled) setResolvedVarValues(next);
    });

    return () => {
      cancelled = true;
    };
  }, [currentVariables, currentStep, trace, storage]);

  // Gas remaining at the current step plus the delta consumed
  // reaching it (when the executor reports gas).
  const gasText = useMemo(() => {
    const step = trace[currentStep];
    if (!step || step.gasRemaining === undefined) return "";
    const rem = step.gasRemaining.toLocaleString();
    const prev = trace[currentStep - 1];
    if (prev?.gasRemaining !== undefined) {
      const delta = prev.gasRemaining - step.gasRemaining;
      if (delta > 0n) return `gas ${rem} (−${delta.toLocaleString()})`;
    }
    return `gas ${rem}`;
  }, [trace, currentStep]);

  // Compile source and run trace in one shot.
  // Takes source directly to avoid stale-state issues.
  const compileAndTrace = useCallback(
    async (sourceCode: string, level: OptLevel) => {
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
          optimizer: { level },
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
    },
    [],
  );

  // Auto compile+trace when a new example is loaded
  useEffect(() => {
    if (example?.source) {
      setLocalSource(example.source);
      compileAndTrace(example.source, optimizerLevelRef.current);
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
    compileAndTrace(source, optimizerLevel);
  }, [source, compileAndTrace, optimizerLevel]);

  const handleLevelChange = useCallback(
    (level: OptLevel) => {
      if (level === optimizerLevel) return;
      setOptimizerLevel(level);
      compileAndTrace(source, level);
    },
    [source, compileAndTrace, optimizerLevel],
  );

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
    <div className="trace-drawer-actions">
      <div
        className="opt-level-toggle"
        role="group"
        aria-label="Optimizer level"
      >
        <span className="opt-level-label">Opt</span>
        {OPT_LEVELS.map((level) => (
          <button
            key={level}
            className={`opt-level-btn ${
              optimizerLevel === level ? "active" : ""
            }`}
            onClick={() => handleLevelChange(level)}
            disabled={isBusy}
            type="button"
            title={OPT_LEVEL_TITLES[level]}
            aria-pressed={optimizerLevel === level}
          >
            O{level}
          </button>
        ))}
      </div>
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
    </div>
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
            <div className="trace-viewer" ref={viewerRef}>
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
                        {frame.isTailCall && (
                          <span
                            className="call-stack-tailcall"
                            title="Tail call: frame reused in place (TCO)"
                          >
                            ⮌ tail call
                          </span>
                        )}
                        {frame.isInline && (
                          <span
                            className="call-stack-inline"
                            title="Inlined: virtual activation — body spliced into the caller, no call occurred"
                          >
                            ⧉ inline
                          </span>
                        )}
                      </button>
                    </React.Fragment>
                  ))
                )}
              </div>

              {currentCallInfo && (
                <div
                  className={`call-info-bar ${
                    currentCallInfo.isInline
                      ? "call-info-inline"
                      : currentCallInfo.isTailCall
                        ? "call-info-tailcall"
                        : `call-info-${currentCallInfo.kind}`
                  }`}
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
                    transformsByStep={transformsByStep}
                    callBadgeByStep={callBadgeByStep}
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
                        {gasText && (
                          <span className="opcode-gas">{gasText}</span>
                        )}
                      </div>

                      {currentTransforms.length > 0 && (
                        <Section title="Transform">
                          <TransformList transforms={currentTransforms} />
                        </Section>
                      )}

                      <Section title="Stack">
                        <StackDisplay stack={currentTraceStep.stack} />
                      </Section>

                      {currentVariables.length > 0 && (
                        <Section title="Variables">
                          <VariablesDisplay
                            variables={currentVariables}
                            resolved={resolvedVarValues}
                          />
                        </Section>
                      )}

                      {Object.keys(storage).length > 0 && (
                        <Section title="Storage" defaultOpen={false}>
                          <StorageDisplay storage={storage} />
                        </Section>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div
                className={`instruction-object-panel${
                  isResizingObject ? " resizing-object" : ""
                }`}
              >
                {showInstructionObject && (
                  <div
                    className="instruction-object-resize-handle"
                    onPointerDown={handleObjectResizeStart}
                    onPointerMove={handleObjectResizeMove}
                    onPointerUp={handleObjectResizeEnd}
                    onPointerCancel={handleObjectResizeEnd}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize instruction object panel"
                  >
                    <div className="instruction-object-resize-bar" />
                  </div>
                )}
                <div className="panel-header instruction-object-header">
                  <label className="instruction-object-toggle">
                    <input
                      type="checkbox"
                      checked={showInstructionObject}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setShowInstructionObject(on);
                        if (on) {
                          setObjectHeight((h) => clampObjectHeight(h));
                        }
                      }}
                    />
                    <span>
                      <code>ethdebug/format/instruction</code> object
                    </span>
                  </label>
                </div>
                {showInstructionObject && (
                  <div
                    className="instruction-object-body"
                    style={{ height: objectHeight }}
                  >
                    {currentFormatInstruction ? (
                      <pre className="instruction-object-json">
                        {JSON.stringify(currentFormatInstruction, null, 2)}
                      </pre>
                    ) : (
                      <div className="instruction-object-empty">
                        No instruction data for this step.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/** A function-call boundary marker for one trace step. */
interface CallBadge {
  kind: "invoke" | "return";
  id?: string;
}

interface OpcodeListProps {
  trace: TraceStep[];
  currentStep: number;
  onStepClick: (index: number) => void;
  /** Compiler transform tags per trace step (same index as `trace`). */
  transformsByStep: string[][];
  /** Function-call boundary badge per trace step (same index as `trace`). */
  callBadgeByStep: (CallBadge | null)[];
}

function OpcodeList({
  trace,
  currentStep,
  onStepClick,
  transformsByStep,
  callBadgeByStep,
}: OpcodeListProps): JSX.Element {
  // Render the full instruction list; the panel scrolls internally.
  // Keep the active step scrolled into view as the trace advances.
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentStep]);

  return (
    <div className="opcode-list">
      {trace.map((step, index) => {
        const isActive = index === currentStep;
        const transforms = transformsByStep[index] ?? [];
        const isInline = transforms.includes("inline");
        const isTailCall = transforms.includes("tailcall");
        // Show a call badge only when the row isn't already carrying a
        // transform tag (an inlined call keeps its ⧉ inline marker).
        const callBadge =
          !isInline && !isTailCall ? (callBadgeByStep[index] ?? null) : null;
        const className = [
          "opcode-item",
          isActive ? "active" : "",
          isInline ? "opcode-item-inline" : "",
          isTailCall ? "opcode-item-tailcall" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={index}
            ref={isActive ? activeRef : undefined}
            className={className}
            onClick={() => onStepClick(index)}
          >
            <span className="opcode-index">{index + 1}</span>
            <span className="opcode-pc">
              0x{step.pc.toString(16).padStart(4, "0")}
            </span>
            <code className="opcode-name">{step.opcode}</code>
            {isInline && (
              <span
                className="opcode-transform-tag opcode-transform-inline"
                title={'transform: ["inline"] — spliced from the inlined body'}
              >
                ⧉ inline
              </span>
            )}
            {isTailCall && (
              <span
                className="opcode-transform-tag opcode-transform-tailcall"
                title={
                  'transform: ["tailcall"] — tail-call optimized back-edge'
                }
              >
                ⮌ tailcall
              </span>
            )}
            {callBadge && (
              <span
                className={`opcode-call-tag opcode-call-${callBadge.kind}`}
                title={
                  callBadge.kind === "invoke"
                    ? `invoke context — calls ${callBadge.id ?? "function"}`
                    : `return context — returns from ${callBadge.id ?? "function"}`
                }
              >
                {callBadge.kind === "invoke"
                  ? `➜ call ${callBadge.id ?? ""}`.trim()
                  : `↵ return ${callBadge.id ?? ""}`.trim()}
              </span>
            )}
          </div>
        );
      })}
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

/**
 * Convert an Evm.Instruction into an ethdebug/format/instruction object
 * for display (offset, operation, context). Mirrors the compiler's
 * program-builder so the drawer shows the canonical format shape.
 */
function toFormatInstruction(
  instruction: Evm.Instruction,
  offset: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = { offset };

  if (instruction.mnemonic) {
    const operation: Record<string, unknown> = {
      mnemonic: instruction.mnemonic,
    };

    if (instruction.immediates && instruction.immediates.length > 0) {
      operation.arguments = [
        "0x" +
          instruction.immediates
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
      ];
    }

    result.operation = operation;
  }

  if (instruction.debug?.context) {
    result.context = instruction.debug.context;
  }

  return result;
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
  pointer?: unknown;
}

interface VariablesDisplayProps {
  variables: Variable[];
  resolved: Map<string, string>;
}

function VariablesDisplay({
  variables,
  resolved,
}: VariablesDisplayProps): JSX.Element {
  return (
    <div className="variables-list">
      {variables.map((variable, i) => {
        const value = resolved.get(variable.identifier);
        return (
          <div key={i} className="variable-item">
            <span className="variable-name">{variable.identifier}</span>
            {value !== undefined && (
              <code className="variable-value">{formatAsDecimal(value)}</code>
            )}
            {variable.type && (
              <span className="variable-type">{variable.type}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One-line glosses for known transform identifiers. */
const TRANSFORM_GLOSS: Record<string, string> = {
  tailcall: "tail call — frame reused, no new activation (TCO)",
  inline: "inlined function body",
  fold: "constant-folded at compile time",
  coalesce: "merged read/write sequence",
};

function TransformList({ transforms }: { transforms: string[] }): JSX.Element {
  return (
    <div className="transform-list">
      {transforms.map((t, i) => (
        <div key={i} className="transform-item">
          <span className="transform-tag">{t}</span>
          <span className="transform-gloss">
            {TRANSFORM_GLOSS[t] ?? "compiler transform"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A collapsible right-column section. */
function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <details className="trace-section" open={defaultOpen}>
      <summary className="trace-section-summary">{title}</summary>
      {children}
    </details>
  );
}

/**
 * Info about a call context (invoke/return/revert).
 */
/**
 * Format a call info banner string.
 */
function formatCallBanner(info: CallInfo): string {
  const name = info.identifier || "(anonymous)";
  const params = info.argumentNames
    ? `(${info.argumentNames.join(", ")})`
    : "()";
  if (info.isTailCall) {
    return `Tail call: ${name} (frame reused)`;
  }
  if (info.isInline) {
    // No call actually occurs — the body was spliced in at compile time.
    switch (info.kind) {
      case "invoke":
        return `Inlined ${name}${params} (no call — body spliced in)`;
      case "return":
        return `End of inlined ${name}()`;
      case "revert":
        return `Reverted in inlined ${name}()`;
    }
  }
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
          pointer: variable.pointer,
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
