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
} from "react";
import type { Pointer, Program } from "@ethdebug/format";
import { dereference, Data } from "@ethdebug/pointers";
import {
  type TraceStep,
  extractVariablesFromInstruction,
  buildPcToInstructionMap,
} from "#utils/mockTrace";
import { traceStepToMachineState } from "#utils/traceState";

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
  /** Whether we're at the first step */
  isAtStart: boolean;
  /** Whether we're at the last step */
  isAtEnd: boolean;

  /** Move to the next step */
  stepForward(): void;
  /** Move to the previous step */
  stepBackward(): void;
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

  const stepForward = useCallback(() => {
    setCurrentStepIndex((prev) => Math.min(prev + 1, trace.length - 1));
  }, [trace.length]);

  const stepBackward = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

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
    isAtStart: currentStepIndex === 0,
    isAtEnd: currentStepIndex >= trace.length - 1,
    stepForward,
    stepBackward,
    jumpToStep,
    reset,
    jumpToEnd,
  };

  return (
    <TraceContext.Provider value={state}>{children}</TraceContext.Provider>
  );
}
