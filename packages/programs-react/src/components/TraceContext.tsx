/**
 * React context for execution trace state management.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { Pointer, Program } from "@ethdebug/format";
import { dereference, Data } from "@ethdebug/pointers";
import {
  type TraceStep,
  type CallInfo,
  type CallFrame,
  extractVariablesFromInstruction,
  extractCallInfoFromInstruction,
  buildPcToInstructionMap,
  buildCallStack,
} from "#utils/mockTrace";
import { traceStepToMachineState } from "#utils/traceState";

/**
 * Compute a key representing an instruction's source range,
 * used to detect when stepping has moved to a new source
 * location. Returns empty string for instructions without
 * source ranges.
 */
function sourceRangeKey(instruction: Program.Instruction | undefined): string {
  if (!instruction?.context) return "";

  const ctx = instruction.context as Record<string, unknown>;
  const ranges = collectCodeRanges(ctx);
  if (ranges.length === 0) return "";

  return ranges.map((r) => `${r.offset}:${r.length}`).join(",");
}

function collectCodeRanges(
  ctx: Record<string, unknown>,
): Array<{ offset: number; length: number }> {
  if ("code" in ctx && typeof ctx.code === "object") {
    const code = ctx.code as Record<string, unknown>;
    if (code.range && typeof code.range === "object") {
      const r = code.range as Record<string, number>;
      if (typeof r.offset === "number" && typeof r.length === "number") {
        return [{ offset: r.offset, length: r.length }];
      }
    }
  }

  if ("gather" in ctx && Array.isArray(ctx.gather)) {
    return ctx.gather.flatMap((item: unknown) =>
      item && typeof item === "object"
        ? collectCodeRanges(item as Record<string, unknown>)
        : [],
    );
  }

  if ("pick" in ctx && Array.isArray(ctx.pick)) {
    return ctx.pick.flatMap((item: unknown) =>
      item && typeof item === "object"
        ? collectCodeRanges(item as Record<string, unknown>)
        : [],
    );
  }

  return [];
}

/**
 * A variable with its resolved value.
 */
export interface ResolvedVariable {
  /** Variable identifier (name) */
  identifier?: string;
  /** Variable type information */
  type?: unknown;
  /** Variable pointer for resolution */
  pointer?: unknown;
  /** Resolved value (if available) */
  value?: string;
  /** Error if resolution failed */
  error?: string;
}

/**
 * A resolved pointer ref with its label and value.
 */
export interface ResolvedPointerRef {
  /** Label for this pointer (e.g., "target", "arguments") */
  label: string;
  /** The raw pointer */
  pointer: unknown;
  /** Resolved hex value */
  value?: string;
  /** Error if resolution failed */
  error?: string;
}

/**
 * Call info with resolved pointer values.
 */
export interface ResolvedCallInfo {
  /** The kind of call event */
  kind: "invoke" | "return" | "revert";
  /** Function name */
  identifier?: string;
  /** Call variant for invoke contexts */
  callType?: "internal" | "external" | "create";
  /** Named arguments (from invoke context) */
  argumentNames?: string[];
  /** Panic code for revert contexts */
  panic?: number;
  /** Resolved pointer refs */
  pointerRefs: ResolvedPointerRef[];
}

/**
 * A call frame with resolved argument values.
 */
export interface ResolvedCallFrame {
  /** Function name */
  identifier?: string;
  /** The step index where this call was invoked */
  stepIndex: number;
  /** The call type */
  callType?: "internal" | "external" | "create";
  /** Argument names paired with resolved values */
  resolvedArgs?: Array<{
    name: string;
    value?: string;
    error?: string;
  }>;
}

/**
 * State provided by the Trace context.
 */
export interface TraceState {
  /** The execution trace steps */
  trace: TraceStep[];
  /** The program with instruction metadata */
  program: Program;
  /** Current step index in the trace */
  currentStepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Current trace step */
  currentStep: TraceStep | undefined;
  /** Current instruction at the PC */
  currentInstruction: Program.Instruction | undefined;
  /** Variables in scope at current step */
  currentVariables: ResolvedVariable[];
  /** Call stack at current step */
  callStack: CallFrame[];
  /** Call stack with resolved argument values */
  resolvedCallStack: ResolvedCallFrame[];
  /** Call info for current instruction (if any) */
  currentCallInfo: ResolvedCallInfo | undefined;
  /** Whether we're at the first step */
  isAtStart: boolean;
  /** Whether we're at the last step */
  isAtEnd: boolean;

  /** Move to the next trace step */
  stepForward(): void;
  /** Move to the previous trace step */
  stepBackward(): void;
  /** Step to the next different source range */
  stepToNextSource(): void;
  /** Step to the previous different source range */
  stepToPrevSource(): void;
  /** Jump to a specific step */
  jumpToStep(index: number): void;
  /** Reset to the first step */
  reset(): void;
  /** Jump to the end */
  jumpToEnd(): void;
}

const TraceContext = createContext<TraceState | undefined>(undefined);

/**
 * Hook to access the Trace context.
 *
 * @returns The current trace state
 * @throws If used outside of a TraceProvider
 */
export function useTraceContext(): TraceState {
  const context = useContext(TraceContext);
  if (context === undefined) {
    throw new Error("useTraceContext must be used within a TraceProvider");
  }
  return context;
}

/**
 * Props for TraceProvider.
 */
export interface TraceProviderProps {
  /** The execution trace */
  trace: TraceStep[];
  /** The program definition */
  program: Program;
  /** Initial step index (default: 0) */
  initialStepIndex?: number;
  /** Pointer templates for dereference (default: {}) */
  templates?: Pointer.Templates;
  /** Whether to resolve variable values (default: true) */
  resolveVariables?: boolean;
  /** Children to render */
  children: React.ReactNode;
}

/**
 * Resolve a single variable's pointer against machine
 * state, returning the hex-formatted value.
 */
async function resolveVariableValue(
  pointer: Pointer,
  step: TraceStep,
  templates: Pointer.Templates,
): Promise<string> {
  const state = traceStepToMachineState(step);
  const cursor = await dereference(pointer, {
    state,
    templates,
  });
  const view = await cursor.view(state);

  // Collect values from all regions
  const values: Data[] = [];
  for (const region of view.regions) {
    const data = await view.read(region);
    values.push(data);
  }

  if (values.length === 0) {
    return "0x";
  }

  // Single region: return its hex value
  if (values.length === 1) {
    return values[0].toHex();
  }

  // Multiple regions: concatenate hex values
  return values.map((d) => d.toHex()).join(", ");
}

/**
 * Provides trace context to child components.
 */
export function TraceProvider({
  trace,
  program,
  initialStepIndex = 0,
  templates = {},
  resolveVariables: shouldResolve = true,
  children,
}: TraceProviderProps): JSX.Element {
  const [currentStepIndex, setCurrentStepIndex] = useState(
    Math.min(initialStepIndex, trace.length - 1),
  );

  const pcToInstruction = useMemo(
    () => buildPcToInstructionMap(program),
    [program],
  );

  const currentStep = trace[currentStepIndex];
  const currentInstruction = currentStep
    ? pcToInstruction.get(currentStep.pc)
    : undefined;

  // Extract variable metadata (synchronous)
  const extractedVars = useMemo(() => {
    if (!currentInstruction) {
      return [];
    }
    return extractVariablesFromInstruction(currentInstruction);
  }, [currentInstruction]);

  // Async variable resolution
  const [currentVariables, setCurrentVariables] = useState<ResolvedVariable[]>(
    [],
  );

  useEffect(() => {
    if (extractedVars.length === 0) {
      setCurrentVariables([]);
      return;
    }

    // Immediately show variables with no values
    const initial: ResolvedVariable[] = extractedVars.map((v) => ({
      identifier: v.identifier,
      type: v.type,
      pointer: v.pointer,
      value: undefined,
      error: undefined,
    }));
    setCurrentVariables(initial);

    if (!shouldResolve || !currentStep) {
      return;
    }

    // Track whether effect is still current
    let cancelled = false;

    // Resolve each variable with a pointer in parallel
    const resolved = [...initial];
    const promises = extractedVars.map(async (v, index) => {
      if (!v.pointer) {
        return;
      }

      try {
        const value = await resolveVariableValue(
          v.pointer as Pointer,
          currentStep,
          templates,
        );
        if (!cancelled) {
          resolved[index] = {
            ...resolved[index],
            value,
          };
          setCurrentVariables([...resolved]);
        }
      } catch (err) {
        if (!cancelled) {
          resolved[index] = {
            ...resolved[index],
            error: err instanceof Error ? err.message : String(err),
          };
          setCurrentVariables([...resolved]);
        }
      }
    });

    Promise.all(promises).catch(() => {
      // Individual errors already handled above
    });

    return () => {
      cancelled = true;
    };
  }, [extractedVars, currentStep, shouldResolve, templates]);

  // Build call stack by scanning instructions up to current step
  const callStack = useMemo(
    () => buildCallStack(trace, pcToInstruction, currentStepIndex),
    [trace, pcToInstruction, currentStepIndex],
  );

  // Resolve argument values for call stack frames.
  // Cache by stepIndex so we don't re-resolve frames that
  // haven't changed when the user steps forward.
  const argCacheRef = useRef<Map<number, ResolvedCallFrame["resolvedArgs"]>>(
    new Map(),
  );

  const [resolvedCallStack, setResolvedCallStack] = useState<
    ResolvedCallFrame[]
  >([]);

  useEffect(() => {
    if (callStack.length === 0) {
      setResolvedCallStack([]);
      return;
    }

    // Build initial resolved frames using cached values
    const initial: ResolvedCallFrame[] = callStack.map((frame) => ({
      identifier: frame.identifier,
      stepIndex: frame.stepIndex,
      callType: frame.callType,
      resolvedArgs: argCacheRef.current.get(frame.stepIndex),
    }));
    setResolvedCallStack(initial);

    if (!shouldResolve) {
      return;
    }

    let cancelled = false;
    const resolved = [...initial];

    // Resolve frames that aren't cached yet
    const promises = callStack.map(async (frame, index) => {
      if (argCacheRef.current.has(frame.stepIndex)) {
        return;
      }

      const names = frame.argumentNames;
      const pointers = frame.argumentPointers;
      if (!pointers || pointers.length === 0) {
        return;
      }

      const step = trace[frame.stepIndex];
      if (!step) {
        return;
      }

      const args: NonNullable<ResolvedCallFrame["resolvedArgs"]> = pointers.map(
        (_, i) => ({
          name: names?.[i] ?? `_${i}`,
        }),
      );

      const resolvePromises = pointers.map(async (ptr, i) => {
        try {
          const value = await resolveVariableValue(
            ptr as Pointer,
            step,
            templates,
          );
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
        resolved[index] = {
          ...resolved[index],
          resolvedArgs: args,
        };
        setResolvedCallStack([...resolved]);
      }
    });

    Promise.all(promises).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [callStack, shouldResolve, trace, templates]);

  // Extract call info for current instruction (synchronous)
  const extractedCallInfo = useMemo((): CallInfo | undefined => {
    if (!currentInstruction) {
      return undefined;
    }
    return extractCallInfoFromInstruction(currentInstruction);
  }, [currentInstruction]);

  // Async call info pointer resolution
  const [currentCallInfo, setCurrentCallInfo] = useState<
    ResolvedCallInfo | undefined
  >(undefined);

  useEffect(() => {
    if (!extractedCallInfo) {
      setCurrentCallInfo(undefined);
      return;
    }

    // Immediately show call info without resolved values
    const initial: ResolvedCallInfo = {
      kind: extractedCallInfo.kind,
      identifier: extractedCallInfo.identifier,
      callType: extractedCallInfo.callType,
      argumentNames: extractedCallInfo.argumentNames,
      panic: extractedCallInfo.panic,
      pointerRefs: extractedCallInfo.pointerRefs.map((ref) => ({
        label: ref.label,
        pointer: ref.pointer,
        value: undefined,
        error: undefined,
      })),
    };
    setCurrentCallInfo(initial);

    if (!shouldResolve || !currentStep) {
      return;
    }

    let cancelled = false;
    const resolved = [...initial.pointerRefs];

    const promises = extractedCallInfo.pointerRefs.map(async (ref, index) => {
      try {
        const value = await resolveVariableValue(
          ref.pointer as Pointer,
          currentStep,
          templates,
        );
        if (!cancelled) {
          resolved[index] = {
            ...resolved[index],
            value,
          };
          setCurrentCallInfo({
            ...initial,
            pointerRefs: [...resolved],
          });
        }
      } catch (err) {
        if (!cancelled) {
          resolved[index] = {
            ...resolved[index],
            error: err instanceof Error ? err.message : String(err),
          };
          setCurrentCallInfo({
            ...initial,
            pointerRefs: [...resolved],
          });
        }
      }
    });

    Promise.all(promises).catch(() => {
      // Individual errors already handled
    });

    return () => {
      cancelled = true;
    };
  }, [extractedCallInfo, currentStep, shouldResolve, templates]);

  const stepForward = useCallback(() => {
    setCurrentStepIndex((prev) => Math.min(prev + 1, trace.length - 1));
  }, [trace.length]);

  const stepBackward = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const stepToNextSource = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const currentKey = sourceRangeKey(pcToInstruction.get(trace[prev]?.pc));
      for (let i = prev + 1; i < trace.length; i++) {
        const instr = pcToInstruction.get(trace[i].pc);
        const key = sourceRangeKey(instr);
        if (key !== currentKey && key !== "") {
          return i;
        }
      }
      return trace.length - 1;
    });
  }, [trace, pcToInstruction]);

  const stepToPrevSource = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const currentKey = sourceRangeKey(pcToInstruction.get(trace[prev]?.pc));
      // First skip past all steps with the same range
      let i = prev - 1;
      while (i > 0) {
        const key = sourceRangeKey(pcToInstruction.get(trace[i].pc));
        if (key !== currentKey && key !== "") break;
        i--;
      }
      // Now find the start of that source range
      const targetKey = sourceRangeKey(pcToInstruction.get(trace[i]?.pc));
      while (i > 0) {
        const prevKey = sourceRangeKey(pcToInstruction.get(trace[i - 1]?.pc));
        if (prevKey !== targetKey) break;
        i--;
      }
      return Math.max(0, i);
    });
  }, [trace, pcToInstruction]);

  const jumpToStep = useCallback(
    (index: number) => {
      setCurrentStepIndex(Math.max(0, Math.min(index, trace.length - 1)));
    },
    [trace.length],
  );

  const reset = useCallback(() => {
    setCurrentStepIndex(0);
  }, []);

  const jumpToEnd = useCallback(() => {
    setCurrentStepIndex(trace.length - 1);
  }, [trace.length]);

  const state: TraceState = {
    trace,
    program,
    currentStepIndex,
    totalSteps: trace.length,
    currentStep,
    currentInstruction,
    currentVariables,
    callStack,
    resolvedCallStack,
    currentCallInfo,
    isAtStart: currentStepIndex === 0,
    isAtEnd: currentStepIndex >= trace.length - 1,
    stepForward,
    stepBackward,
    stepToNextSource,
    stepToPrevSource,
    jumpToStep,
    reset,
    jumpToEnd,
  };

  return (
    <TraceContext.Provider value={state}>{children}</TraceContext.Provider>
  );
}
