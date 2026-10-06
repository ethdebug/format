import type * as Format from "@ethdebug/format";
import type * as Ir from "#ir";
import type { Stack } from "#evm";

import type { State } from "#evmgen/state";
import { type Transition, pipe, operations } from "#evmgen/operations";
import { calculateSize } from "#evmgen/serialize";

import { loadValue } from "../values/index.js";

const { PUSHn, PUSH2, JUMPI, JUMPDEST, MSTORE, REVERT } = operations;

/** Selector of Solidity's `Panic(uint256)` error */
const PANIC_SELECTOR = 0x4e487b71n;

/**
 * Generate code for an assert: jump over the revert if the condition
 * holds, else revert with `Panic(code)`, ABI-encoded as Solidity does.
 *
 *   <condition> PUSH2 ok JUMPI
 *   mstore(0, selector) mstore(0x20, code) revert(0x1c, 0x24)
 *   ok: JUMPDEST
 *
 * The jump target is a label inside the block; its offset goes in
 * `blockOffsets`, so the jump is patched like a jump to a block.
 */
export function generateAssert<S extends Stack>(
  inst: Ir.Instruction.Assert,
): Transition<S, S> {
  const debug = inst.operationDebug;
  const revertDebug = {
    ...debug,
    context: {
      ...debug.context,
      revert: {
        panic: inst.panic,
        reason: {
          pointer: { location: "memory", offset: 0x1c, length: 0x24 },
        },
      },
    } as Format.Program.Context,
  };

  return ((state: State<Stack>): State<Stack> => {
    const label = `$assert_${state.nextId}`;

    const loaded = pipe<Stack>()
      .then(loadValue(inst.condition, { debug }), { as: "b" })
      .done()({ ...state, nextId: state.nextId + 1 });

    const patchIndex = loaded.instructions.length;
    const jumped = pipe<readonly ["b", ...Stack]>()
      .then(PUSH2([0, 0], { debug }), { as: "counter" })
      .then(JUMPI({ debug }))
      .then(PUSHn(PANIC_SELECTOR, { debug }), { as: "value" })
      .then(PUSHn(0n, { debug }), { as: "offset" })
      .then(MSTORE({ debug }))
      .then(PUSHn(BigInt(inst.panic), { debug }), { as: "value" })
      .then(PUSHn(0x20n, { debug }), { as: "offset" })
      .then(MSTORE({ debug }))
      .then(PUSHn(0x24n, { debug }), { as: "size" })
      .then(PUSHn(0x1cn, { debug }), { as: "offset" })
      .then(REVERT({ debug: revertDebug }))
      .done()(loaded);

    return JUMPDEST({ debug })({
      ...jumped,
      patches: [...jumped.patches, { index: patchIndex, target: label }],
      blockOffsets: {
        ...jumped.blockOffsets,
        [label]: calculateSize(jumped.instructions),
      },
    });
  }) as unknown as Transition<S, S>;
}
