import { Program, Materials } from "@ethdebug/format";

export type DynamicInstruction = Omit<
  Program.Instruction,
  "context" | "operation"
> & { operation: Program.Instruction.Operation } & { context: DynamicContext };

export type DynamicContext = Program.Context | ContextThunk;

export type ContextThunk = (props: {
  findSourceRange(
    query: string,
    options?: FindSourceRangeOptions,
  ): Materials.SourceRange | undefined;
}) => Program.Context;

export interface FindSourceRangeOptions {
  source?: Materials.Reference<Materials.Source>;
  after?: string;
}

export interface ResolverOptions {
  sources: Materials.Source[];
}

export function resolveDynamicInstruction(
  dynamicInstruction: DynamicInstruction,
  options: ResolverOptions,
): Program.Instruction {
  const context = resolveDynamicContext(dynamicInstruction.context, options);

  const instruction = {
    ...dynamicInstruction,
    context,
  };

  return instruction;
}

function resolveDynamicContext(
  context: DynamicContext,
  { sources }: ResolverOptions,
): Program.Context {
  if (typeof context !== "function") {
    return context;
  }

  const findSourceRange = (
    query: string,
    options: FindSourceRangeOptions = {},
  ) => {
    const source =
      "source" in options && options.source
        ? sources.find((source) => source.id === options.source?.id)
        : sources[0];

    if (!source) {
      return;
    }

    const afterQuery = options.after || "";

    const afterQueryOffset = source.contents.indexOf(afterQuery);
    if (afterQueryOffset === -1) {
      throw new Error(
        `Unexpected could not find string ${options.after} as prior occurrence to ${query}`,
      );
    }

    const startOffset = afterQueryOffset + afterQuery.length;

    const offset = source.contents.indexOf(query, startOffset);
    if (offset === -1) {
      throw new Error(`Unexpected could not find string ${query}`);
    }

    const length = query.length;

    return {
      source: { id: source.id },
      range: {
        offset,
        length,
      },
    };
  };

  return context({ findSourceRange });
}
