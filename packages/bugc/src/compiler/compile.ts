/**
 * Unified compile interface for the BUG compiler
 */

import {
  buildSequence,
  type SequenceNeeds,
  type SequenceAdds,
} from "./sequence.js";
import {
  targetSequences,
  type Target,
  type TargetSequence,
} from "./sequences/index.js";
import type { Result } from "#result";
import type { BugError } from "#errors";

export type CompileOptions<T extends Target> = { to: T } & SequenceNeeds<
  TargetSequence<T>
>;

/**
 * Compile BUG source code to the specified target
 */
export async function compile<T extends Target>(
  options: CompileOptions<T>,
): Promise<Result<SequenceAdds<TargetSequence<T>>, BugError>> {
  const { to, ...input } = options;

  const sequence = buildSequence(targetSequences[to]);
  return await sequence.run(input);
}
