import React, { createContext, useContext, useState, useEffect } from "react";

import {
  type Instruction,
  type Context,
  type ContextThunk,
  computeOffsets,
} from "./types";

interface ProgramExampleContextValue {
  // props
  sourcePath: string;
  sourceContents: string;
  instructions: (Instruction & { offset: number })[];

  // stateful stuff
  context: Context | undefined;
  highlightedOffset: number | undefined;
  highlightInstruction(offset: number | undefined): void;
}

const ProgramExampleContext =
  createContext<ProgramExampleContextValue | undefined>(undefined);

export function useProgramExampleContext() {
  const context = useContext(ProgramExampleContext);
  if (context === undefined) {
    throw new Error("useProgramExampleContext must be used within a ProgramExampleContextProvider");
  }

  return context;
}

export interface ProgramExampleProps {
  sourcePath: string;
  sourceContents: string;
  instructions: Instruction[];
}

export function ProgramExampleContextProvider({
  children,
  ...props
}: ProgramExampleProps & {
  children: React.ReactNode;
}): JSX.Element {
  const {
    sourcePath,
    sourceContents,
    instructions: instructionsWithoutOffsets
  } = props;

  const instructions = computeOffsets(instructionsWithoutOffsets);

  const [
    highlightedOffset,
    highlightInstruction
  ] = useState<number | undefined>();

  const [context, setContext] = useState<Context | undefined>();

  useEffect(() => {
    if (typeof highlightedOffset === "undefined") {
      setContext(undefined);
      return;
    }

    const instruction = instructions
      .find(({ offset }) => offset === highlightedOffset);

    if (!instruction) {
      throw new Error(`Unexpected could not find instruction with offset ${highlightedOffset}`);
    }

    const context = resolveContext(instruction.context, props);

    setContext(context);
  }, [highlightedOffset, setContext]);

  return <ProgramExampleContext.Provider value={{
    sourcePath,
    sourceContents,
    context,
    instructions,
    highlightedOffset,
    highlightInstruction
  }}>
    {children}
  </ProgramExampleContext.Provider>
}

function resolveContext(
  context: Context | ContextThunk,
  props: ProgramExampleProps
): Context {
  if (typeof context !== "function") {
    return context;
  }

  const { sourcePath, sourceContents } = props;

  const source = {
    id: sourcePath
  };

  const rangeFor = (query: string) => {
    const offset = sourceContents.indexOf(query);
    if (offset === -1) {
      throw new Error(`Unexpected could not find string ${query}`);
    }

    const length = query.length;

    return {
      offset,
      length
    };
  };

  return context({ source, rangeFor });
}
