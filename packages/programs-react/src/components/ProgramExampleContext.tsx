/**
 * React context for program example state management.
 */

import React, { createContext, useContext, useState, useEffect } from "react";

import { Data, Materials, Program } from "@ethdebug/format";
import { computeOffsets } from "#utils/offsets";
import {
  type DynamicInstruction,
  resolveDynamicInstruction,
} from "#utils/dynamic";

/**
 * State provided by the ProgramExample context.
 */
export interface ProgramExampleState {
  /** Source materials for the program */
  sources: Materials.Source[];
  /** Resolved program instructions */
  instructions: Program.Instruction[];
  /** Currently highlighted instruction, if any */
  highlightedInstruction: Program.Instruction | undefined;
  /** Function to highlight an instruction by offset */
  highlightInstruction(offset: Data.Value | undefined): void;
  /** Current highlight mode */
  highlightMode: "simple" | "detailed";
  /** Switch to detailed highlight mode */
  showDetails(): void;
  /** Switch to simple highlight mode */
  hideDetails(): void;
}

const ProgramExampleContext = createContext<ProgramExampleState | undefined>(
  undefined,
);

/**
 * Hook to access the ProgramExample context.
 *
 * @returns The current ProgramExample state
 * @throws If used outside of a ProgramExampleContextProvider
 */
export function useProgramExampleContext(): ProgramExampleState {
  const context = useContext(ProgramExampleContext);
  if (context === undefined) {
    throw new Error(
      "useProgramExampleContext must be used within a " +
        "ProgramExampleContextProvider",
    );
  }

  return context;
}

/**
 * Props for ProgramExampleContextProvider.
 */
export interface ProgramExampleProps {
  /** Source materials */
  sources: Materials.Source[];
  /** Dynamic instructions (without offsets) */
  instructions: Omit<DynamicInstruction, "offset">[];
}

/**
 * Provides program example context to child components.
 *
 * @param props - Sources, instructions, and children
 * @returns Context provider wrapping children
 */
export function ProgramExampleContextProvider({
  children,
  ...props
}: ProgramExampleProps & {
  children: React.ReactNode;
}): JSX.Element {
  const { sources, instructions: dynamicInstructionsWithoutOffsets } = props;

  const dynamicInstructions = computeOffsets(dynamicInstructionsWithoutOffsets);

  const instructions = dynamicInstructions.map((dynamicInstruction) =>
    resolveDynamicInstruction(dynamicInstruction, { sources }),
  );

  const [highlightedOffset, highlightInstruction] = useState<
    Data.Value | undefined
  >();
  const [highlightedInstruction, setHighlightedInstruction] = useState<
    Program.Instruction | undefined
  >();
  const [highlightMode, setHighlightMode] = useState<"simple" | "detailed">(
    "simple",
  );

  const showDetails = () => setHighlightMode("detailed");
  const hideDetails = () => setHighlightMode("simple");

  useEffect(() => {
    if (typeof highlightedOffset === "undefined") {
      setHighlightedInstruction(undefined);
      return;
    }

    const instruction = instructions.find(
      ({ offset }) => offset === highlightedOffset,
    );

    if (!instruction) {
      throw new Error(
        `Unexpected could not find instruction with offset ${highlightedOffset}`,
      );
    }

    setHighlightedInstruction(instruction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedOffset, setHighlightedInstruction]);

  return (
    <ProgramExampleContext.Provider
      value={{
        sources,
        instructions,
        highlightedInstruction,
        highlightInstruction,
        highlightMode,
        showDetails,
        hideDetails,
      }}
    >
      {children}
    </ProgramExampleContext.Provider>
  );
}
