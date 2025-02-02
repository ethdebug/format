
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

export interface Instruction {
  operation: Operation;
  context: Context | ContextThunk;
}

export interface Operation {
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

export interface InstructionWithOffset extends Instruction {
  offset: number;
}


export function computeOffsets(
  instructions: Instruction[]
): InstructionWithOffset[] {
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
