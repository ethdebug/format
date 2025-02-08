import React, { createContext, useContext, useState, useEffect } from "react";

import { Data, Materials, Program } from "@ethdebug/format";
import { computeOffsets } from "./offsets";
import { type DynamicInstruction, resolveDynamicInstruction } from "./dynamic";


export interface ProgramExampleState {
  // props
  sources: Materials.Source[];
  instructions: Program.Instruction[];

  // stateful stuff
  highlightedInstruction: Program.Instruction | undefined;
  highlightInstruction(offset: Data.Value | undefined): void;
  highlightMode: "simple" | "detailed";
  showDetails(): void;
  hideDetails(): void;
}

const ProgramExampleContext =
  createContext<ProgramExampleState | undefined>(undefined);

export function useProgramExampleContext() {
  const context = useContext(ProgramExampleContext);
  if (context === undefined) {
    throw new Error("useProgramExampleContext must be used within a ProgramExampleContextProvider");
  }

  return context;
}

export interface ProgramExampleProps {
  sources: Materials.Source[];
  instructions: Omit<DynamicInstruction, "offset">[];
}

export function ProgramExampleContextProvider({
  children,
  ...props
}: ProgramExampleProps & {
  children: React.ReactNode;
}): JSX.Element {
  const {
    sources,
    instructions: dynamicInstructionsWithoutOffsets
  } = props;

  const dynamicInstructions = computeOffsets(
    dynamicInstructionsWithoutOffsets
  );

  const instructions = dynamicInstructions.map(
    (dynamicInstruction) =>
      resolveDynamicInstruction(dynamicInstruction, { sources })
  );

  const [
    highlightedOffset,
    highlightInstruction
  ] = useState<Data.Value | undefined>();
  const [
    highlightedInstruction,
    setHighlightedInstruction
  ] = useState<Program.Instruction | undefined>();
  const [
    highlightMode,
    setHighlightMode
  ] = useState<"simple" | "detailed">("simple");

  const showDetails = () => setHighlightMode("detailed");
  const hideDetails = () => setHighlightMode("simple");

  useEffect(() => {
    if (typeof highlightedOffset === "undefined") {
      setHighlightedInstruction(undefined);
      return;
    }

    const instruction = instructions
      .find(({ offset }) => offset === highlightedOffset);

    if (!instruction) {
      throw new Error(`Unexpected could not find instruction with offset ${highlightedOffset}`);
    }

    setHighlightedInstruction(instruction);
  }, [highlightedOffset, setHighlightedInstruction]);

  return <ProgramExampleContext.Provider value={{
    sources,
    instructions,
    highlightedInstruction,
    highlightInstruction,
    highlightMode,
    showDetails,
    hideDetails
  }}>
    {children}
  </ProgramExampleContext.Provider>
}
