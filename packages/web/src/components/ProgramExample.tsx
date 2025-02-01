import React, { createContext, useContext, useState, useEffect } from "react";

import CodeBlock, { type Props as CodeBlockProps } from "@theme/CodeBlock";

export interface ProgramExampleProps {
  sourcePath: string;
  sourceContents: string;
  instructions: Instruction[];
}

interface Instruction {
  operation: Operation;
  context: Context | ContextThunk;
}

interface InstructionWithOffset extends Instruction {
  offset: number;
}

interface Operation {
  mnemonic: string;
  arguments?: `0x${string}`[];
  comment?: string;
}

export type ContextThunk = (props: {
  source: { id: any; };
  rangeFor(query: string): {
    offset: number;
    length: number;
  };
}) => Context;

export interface Context {
  code?: {
    source: {
      id: any;
    };
    range?: {
      offset: number;
      length: number;
    }
  };
}

interface ProgramExampleContextValue {
  // props
  sourcePath: string;
  sourceContents: string;
  instructions: (Instruction & { offset: number })[];

  // stateful stuff
  context: Context | undefined;
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

export function SourceContents(
  props: Exclude<CodeBlockProps, "children">
): JSX.Element {
  const {
    sourceContents,

    context
  } = useProgramExampleContext();

  useEffect(() => {
    console.log("context %o", context);
  }, [context]);

  return <CodeBlock
    language="typescript"
    {...{
      showLineNumbers: true,
      ...props
    }}
  >{
    sourceContents
  }</CodeBlock>;
}

export function Opcodes(): JSX.Element {
  const {
    instructions,
    highlightInstruction
  } = useProgramExampleContext();

  const paddingLength = instructions.at(-1)!.offset.toString(16).length;

  return <dl>{
    instructions.map(({ offset, operation }) =>
      <Opcode
        key={offset}
        offset={offset}
        paddingLength={paddingLength}
        operation={operation}
        onMouseEnter={() => highlightInstruction(offset)}
        onMouseLeave={() => highlightInstruction(undefined)}
      />
    )
  }</dl>
}


function Opcode(props: {
  offset: number;
  paddingLength: number;
  operation: Operation;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): JSX.Element {
  const {
    offset,
    paddingLength,
    operation,
    onMouseEnter,
    onMouseLeave
  } = props;

  const offsetLabel = <>
    0x{offset.toString(16).padStart(paddingLength, "0")}
  </>;

  const operationLabel = <code>{
    [operation.mnemonic, ...operation.arguments || []].join(" ")
  }</code>;

  return <>
    <dt onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{
      offsetLabel
    }</dt>
    <dd onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{
      operationLabel
    }</dd>
  </>;
}

function computeOffsets(instructions: Instruction[]): InstructionWithOffset[] {
  const initialResults: {
    nextOffset: number;
    results: InstructionWithOffset[];
  } = {
    nextOffset: 0,
    results: []
  };

  const {
    results
  } = instructions.reduce(
    ({ nextOffset, results }, instruction) => {
      const result = {
        ...instruction,
        offset: nextOffset
      };

      const operationSize = (
        1 /* for opcode */ +
        Math.ceil(
          (instruction.operation.arguments || [])
            .map(prefixed => prefixed.slice(2))
            .join("")
            .length / 2
        )
      );

      return {
        nextOffset: nextOffset + operationSize,
        results: [
          ...results,
          result
        ]
      };
    },
    initialResults
  );

  return results;
}
