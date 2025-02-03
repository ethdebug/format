import type {
  Id,
  Source,
  Instruction,
  SourceRange,
  Context
} from "./types";

export type DynamicInstruction =
  & Omit<Instruction, "context">
  & { context: DynamicContext; };

export type DynamicContext =
  | Context
  | ContextThunk;

export type ContextThunk = (props: {
  findSourceRange(
    query: string,
    options?: FindSourceRangeOptions
  ): SourceRange | undefined;
}) => Context;

export interface FindSourceRangeOptions {
  source?: {
    id: Id;
  };
}

export interface ResolverOptions {
  sources: Source[];
}

export function resolveDynamicInstruction(
  dynamicInstruction: DynamicInstruction,
  options: ResolverOptions
): Instruction {
  const context = resolveDynamicContext(
    dynamicInstruction.context,
    options
  );

  const instruction = {
    ...dynamicInstruction,
    context
  };

  return instruction;
}

function resolveDynamicContext(
  context: DynamicContext,
  { sources }: ResolverOptions
): Context {
  if (typeof context !== "function") {
    return context;
  }

  const findSourceRange = (
    query: string,
    options: FindSourceRangeOptions = {}
  ) => {
    const source = "source" in options && options.source
      ? sources.find(source => source.id === options.source?.id)
      : sources[0];

    if (!source) {
      return;
    }

    const offset = source.contents.indexOf(query);
    if (offset === -1) {
      throw new Error(`Unexpected could not find string ${query}`);
    }

    const length = query.length;

    return {
      source: { id: source.id },
      range: {
        offset,
        length
      }
    };
  };

  return context({ findSourceRange });
}
