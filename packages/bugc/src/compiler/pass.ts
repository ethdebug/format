import { Result } from "#result";
import type { BugError } from "#errors";

export interface Pass<C extends Pass.Config = Pass.Config> {
  run: Pass.Run<C>;
}

export namespace Pass {
  export type Config = {
    needs: unknown;
    adds: unknown;
    error: BugError;
  };

  export type Needs<C extends Pass.Config> = C["needs"];
  export type Adds<C extends Pass.Config> = C["adds"];
  export type Error<C extends Pass.Config> = C["error"];

  /**
   * A compiler pass is a pure function that transforms input to output
   * and may produce messages (errors/warnings)
   */
  export type Run<C extends Pass.Config> = (
    input: Pass.Needs<C>,
  ) => Promise<Result<Pass.Adds<C>, Pass.Error<C>>>;
}
