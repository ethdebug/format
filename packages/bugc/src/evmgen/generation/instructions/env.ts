import type * as Ir from "#ir";
import type { Stack } from "#evm";
import type { State } from "#evmgen/state";

import { type Transition, pipe, operations } from "#evmgen/operations";

import { storeValueIfNeeded } from "../values/index.js";

const { CALLER, CALLVALUE, PUSH0, TIMESTAMP, NUMBER } = operations;

/**
 * Generate code for environment operations
 */
export function generateEnvOp<S extends Stack>(
  inst: Ir.Instruction.Env,
): Transition<S, readonly ["value", ...S]> {
  const debug = inst.operationDebug;

  const map: {
    [O in Ir.Instruction.Env["op"]]: <S extends Stack>(
      state: State<readonly [...S]>,
    ) => State<readonly [Stack.Brand, ...S]>;
  } = {
    msg_sender: CALLER({ debug }),
    msg_value: CALLVALUE({ debug }),
    msg_data: PUSH0({ debug }), // Returns calldata offset (0)
    block_timestamp: TIMESTAMP({ debug }),
    block_number: NUMBER({ debug }),
  };

  return pipe<S>()
    .then(map[inst.op], { as: "value" })
    .then(storeValueIfNeeded(inst.dest, { debug }))
    .done();
}
