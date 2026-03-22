import type * as Ast from "#ast";
import type { Pass } from "#compiler";
import { Result } from "#result";

import type { Error as ParseError } from "./errors.js";
import { parse } from "./parser.js";

/**
 * Parsing pass - converts source code to AST
 */
const pass: Pass<{
  needs: {
    source: string;
    sourcePath?: string;
  };
  adds: {
    ast: Ast.Program;
  };
  error: ParseError;
}> = {
  async run({ source }) {
    const result = parse(source);
    return Result.map(result, (ast) => ({ ast }));
  },
};

export default pass;
