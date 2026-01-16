/**
 * React context for execution trace state management.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { Program } from "@ethdebug/format";
import {
  type TraceStep,
  extractVariablesFromInstruction,
  buildPcToInstructionMap,
} from "#utils/mockTrace";

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
  /** Children to render */
  children: React.ReactNode;
}

/**
 * Provides trace context to child components.
 */
export function TraceProvider({
  trace,
  program,
  initialStepIndex = 0,
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

  // Extract variables from current instruction
  const currentVariables = useMemo(() => {
    if (!currentInstruction) {
      return [];
    }

    const vars = extractVariablesFromInstruction(currentInstruction);
    return vars.map((v) => ({
      identifier: v.identifier,
      type: v.type,
      pointer: v.pointer,
      // Value resolution would require the full @ethdebug/pointers machinery
      // For now we just show the variable metadata
      value: undefined,
      error: undefined,
    }));
  }, [currentInstruction]);

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
