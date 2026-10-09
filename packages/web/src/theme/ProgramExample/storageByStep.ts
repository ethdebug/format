/**
 * Compute the storage that holds at each step of a trace: the
 * initial storage plus the SSTOREs executed before that step.
 * Like the stack and memory in a step, this is the state before
 * the step's own instruction runs.
 *
 * Trace steps do not carry storage, so each SSTORE is read from
 * its operands on the stack (key on top, then value).
 */
export function storageByStep(
  trace: { opcode: string; stack: readonly bigint[] }[],
  initial: Record<string, string>,
): Record<string, string>[] {
  const states: Record<string, string>[] = [];
  let current = initial;

  for (const step of trace) {
    states.push(current);

    if (step.opcode !== "SSTORE" || step.stack.length < 2) {
      continue;
    }

    const key = step.stack[step.stack.length - 1];
    const value = step.stack[step.stack.length - 2];
    const slot = `0x${key.toString(16).padStart(2, "0")}`;

    current = { ...current };
    if (value === 0n) {
      delete current[slot];
    } else {
      current[slot] = `0x${value.toString(16).padStart(64, "0")}`;
    }
  }

  return states;
}
