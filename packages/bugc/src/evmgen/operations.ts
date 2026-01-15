import * as Evm from "#evm";
import type { _ } from "#evm";

import { type State, type StackItem, controls } from "#evmgen/state";

type UnsafeState = State<_ & Evm.Stack>;
type UnsafeItem = StackItem & { brand: _ & Evm.Stack.Brand };

const rebrands: ReturnType<typeof Evm.makeRebrands<UnsafeState, UnsafeItem>> =
  Evm.makeRebrands<UnsafeState, UnsafeItem>(controls);
export const rebrand: typeof rebrands.rebrand = rebrands.rebrand;
export const rebrandTop: typeof rebrands.rebrandTop = rebrands.rebrandTop;

export type Transition<
  X extends Evm.Stack,
  Y extends Evm.Stack,
> = Evm.Transition<UnsafeState, X, Y>;

export const pipe = Evm.makePipe<UnsafeState, UnsafeItem>(controls);

export type RawOperations = Evm.Operations<UnsafeState, UnsafeItem>;

export const rawOperations: RawOperations = Evm.makeOperations<
  UnsafeState,
  UnsafeItem
>(controls);

export type Operations = typeof rawOperations & {
  DUPn: <S extends Evm.Stack>(
    position: number,
    options?: Evm.InstructionOptions,
  ) => Transition<S, readonly ["value", ...S]>;
  PUSHn: <S extends Evm.Stack>(
    value: bigint,
    options?: Evm.InstructionOptions,
  ) => Transition<readonly [...S], readonly ["value", ...S]>;
};

export const operations: Operations = {
  ...rawOperations,

  DUPn: <S extends Evm.Stack>(
    position: number,
    options?: Evm.InstructionOptions,
  ): Transition<S, readonly ["value", ...S]> => {
    if (position < 1 || position > 16) {
      throw new Error(`Cannot reach stack position ${position}`);
    }

    type DUPn = {
      [O in keyof RawOperations]: O extends `DUP${infer _N}` ? O : never;
    }[keyof RawOperations];

    const DUP = rawOperations[`DUP${position}` as DUPn] as unknown as (
      options?: Evm.InstructionOptions,
    ) => Transition<S, readonly [Evm.Stack.Brand, ...S]>;

    return pipe<S>()
      .peek((state, builder) => {
        // Check if stack has enough elements
        if (state.stack.length < position) {
          throw new Error("Stack too short");
        }

        return builder;
      })
      .then(DUP(options), { as: "value" })
      .done();
  },

  PUSHn: <S extends Evm.Stack>(
    value: bigint,
    options?: Evm.InstructionOptions,
  ): Transition<readonly [...S], readonly ["value", ...S]> => {
    if (value === 0n) {
      return rawOperations.PUSH0(options);
    }

    const immediates = bigintToBytes(value);

    type PUSHn = {
      [O in keyof RawOperations]: O extends `PUSH${infer _N}` ? O : never;
    }[keyof RawOperations];
    const PUSH = rawOperations[`PUSH${immediates.length}` as PUSHn];

    return PUSH(immediates, options);
  },
};

function bigintToBytes(value: bigint): number[] {
  if (value === 0n) return [];

  const hex = value.toString(16);
  const padded = hex.length % 2 ? "0" + hex : hex;
  const bytes: number[] = [];

  for (let i = 0; i < padded.length; i += 2) {
    bytes.push(parseInt(padded.substr(i, 2), 16));
  }

  return bytes;
}
