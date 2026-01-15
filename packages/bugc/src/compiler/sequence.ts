/**
 * Pass sequence builder for composing compiler passes
 */

import { Result, type MessagesBySeverity } from "#result";
import type { Pass } from "./pass.js";

// Type helper to merge all needs from a sequence of passes
export type SequenceNeeds<L extends readonly unknown[]> = Omit<
  L extends readonly [Pass<infer C>, ...infer R]
    ? SequenceNeeds<R> & Pass.Needs<C>
    : unknown,
  keyof SequenceAdds<L>
>;

// Type helper to merge all adds from a sequence of passes
export type SequenceAdds<L extends readonly unknown[]> = Pick<
  _SequenceAdds<L>,
  keyof _SequenceAdds<L>
>;

type _SequenceAdds<L extends readonly unknown[]> = L extends readonly [
  Pass<infer C>,
  ...infer R,
]
  ? SequenceAdds<R> & Pass.Adds<C>
  : unknown;

// Type helper to union all error types from a sequence of passes
export type SequenceErrors<L extends readonly unknown[]> = L extends readonly [
  Pass<infer C>,
  ...infer R,
]
  ? SequenceErrors<R> | Pass.Error<C>
  : never;

// A sequence of passes that acts as a single pass
export type SequencePass<L extends readonly unknown[]> = Pass<{
  needs: SequenceNeeds<L>;
  adds: SequenceAdds<L>;
  error: SequenceErrors<L>;
}>;

/**
 * Build a sequence of passes that executes them in order
 */
export function buildSequence<L extends readonly unknown[]>(
  passes: L,
): SequencePass<L> {
  return {
    async run(
      input: SequenceNeeds<L>,
    ): Promise<Result<SequenceAdds<L>, SequenceErrors<L>>> {
      let currentState = input;
      let messages: MessagesBySeverity<SequenceErrors<L>> = {};

      // Process each pass in sequence
      for (const pass of passes) {
        const result = await (pass as Pass).run(currentState);

        // Accumulate messages from this pass
        messages = Result.mergeMessages(
          messages,
          result.messages as MessagesBySeverity<SequenceErrors<L>>,
        );

        // If pass failed, return error with all messages so far
        if (!result.success) {
          return {
            success: false,
            messages,
          };
        }

        // Update state for next pass by merging in the additions
        currentState = {
          ...currentState,
          ...(result.value as SequenceAdds<L>),
        };
      }

      // All passes succeeded - return final state with all messages
      return {
        success: true,
        value: currentState as SequenceAdds<L>,
        messages,
      };
    },
  };
}
