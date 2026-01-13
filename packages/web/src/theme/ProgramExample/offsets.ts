import { Data, Program } from "@ethdebug/format";

// define base generic instruction since other parts of this module
// allow dynamic contexts and such
interface OffsetComputableInstruction {
  operation: Program.Instruction.Operation;
}

type OffsetComputedInstruction<I extends OffsetComputableInstruction> = I & {
  offset: Data.Value;
};

export function computeOffsets<I extends OffsetComputableInstruction>(
  instructions: I[],
): OffsetComputedInstruction<I>[] {
  const initialResults: {
    nextOffset: number;
    results: OffsetComputedInstruction<I>[];
  } = {
    nextOffset: 0,
    results: [],
  };

  const { results } = instructions.reduce(
    ({ nextOffset, results }, instruction) => {
      const result = {
        offset: nextOffset,
        ...instruction,
      };

      const operationSize =
        1 /* for opcode */ +
        Math.ceil(
          (instruction.operation.arguments || [])
            .map((value) =>
              typeof value === "number" ? value.toString(16) : value.slice(2),
            )
            .join("").length / 2,
        );

      return {
        nextOffset: nextOffset + operationSize,
        results: [...results, result],
      };
    },
    initialResults,
  );

  return results;
}
