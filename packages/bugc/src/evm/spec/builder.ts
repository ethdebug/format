import type { $ } from "./hkts.js";

import type { Stack } from "./stack.js";
import type { State } from "./state.js";
import { makeRebrands } from "./rebrand.js";

export type Transition<U, X extends Stack, Y extends Stack> = (
  state: $<U, [readonly [...X]]>,
) => $<U, [readonly [...Y]]>;

export const makePipe =
  <U, I>(controls: State.Controls<U, I>) =>
  <X extends Stack>() =>
    new PipeBuilder<U, I, X, X>(controls, (state) => state);

export class PipeBuilder<U, I, X extends Stack, Y extends Stack> {
  constructor(
    private readonly controls: State.Controls<U, I>,
    private readonly transition: Transition<U, X, Y>,
  ) {}

  err(error: Error): PipeBuilder<U, I, X, Y> {
    return this.then(() => {
      throw error;
    });
  }

  peek<Z extends Stack>(
    func: (
      state: $<U, [readonly [...Y]]>,
      builder: PipeBuilder<U, I, X, Y>,
    ) => PipeBuilder<U, I, X, Z>,
  ): PipeBuilder<U, I, X, Z> {
    const newTransition = (initialState: $<U, [readonly [...X]]>) => {
      const currentState = this.transition(initialState);
      const continuationBuilder = new PipeBuilder<U, I, Y, Y>(
        this.controls,
        (s) => s,
      );
      const resultBuilder = func(currentState, continuationBuilder);
      return resultBuilder.transition(currentState);
    };

    return new PipeBuilder(this.controls, newTransition);
  }

  then<Z extends Stack>(func: Transition<U, Y, Z>): PipeBuilder<U, I, X, Z>;
  then<Z extends Stack, A extends Stack.Brand, B extends Stack.Brand>(
    func: Transition<U, Y, readonly [A, ...Z]>,
    options: ThenOptions<B>,
  ): PipeBuilder<U, I, X, readonly [B, ...Z]>;
  then<Z extends Stack, B extends Stack.Brand>(
    func: (state: $<U, [Y]>) => $<U, [Z]>,
    options?: ThenOptions<B>,
  ) {
    const { rebrandTop } = makeRebrands(this.controls);

    const newTransition = (state: $<U, [X]>) => func(this.transition(state));

    if (!options) {
      return new PipeBuilder(this.controls, newTransition);
    }

    return new PipeBuilder<U, I, X, readonly [B, ...Z]>(
      this.controls,
      (state: $<U, [X]>) => rebrandTop(options.as)(newTransition(state)),
    );
  }

  done() {
    return (state: $<U, [readonly [...X]]>): $<U, [readonly [...Y]]> => {
      return this.transition(state);
    };
  }
}

export interface ThenOptions<B extends Stack.Brand> {
  as: B;
}
