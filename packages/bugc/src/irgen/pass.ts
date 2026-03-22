import type { Program } from "#ast";
import type { Types } from "#types";
import type * as Ir from "#ir";
import { Result } from "#result";
import type { Pass } from "#compiler";

import { Error as IrgenError } from "./errors.js";
import { generateModule } from "./generator.js";

/**
 * IR generation pass - converts typed AST to intermediate representation
 * and inserts phi nodes for proper SSA form
 */
const pass: Pass<{
  needs: {
    ast: Program;
    types: Types;
    sourcePath?: string;
  };
  adds: {
    ir: Ir.Module;
  };
  error: IrgenError;
}> = {
  async run({ ast, types, sourcePath }) {
    return Result.map(generateModule(ast, types, sourcePath), (ir) => ({ ir }));
  },
};

export default pass;
