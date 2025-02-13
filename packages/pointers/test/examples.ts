import { type Pointer, describeSchema } from "@ethdebug/format";

import type { CompileOptions } from "./solc.js";

export const findExamplePointer = (() => {
  const {
    schema: {
      examples: examplePointers
    }
  } = describeSchema({
    schema: { id: "schema:ethdebug/format/pointer" }
  }) as { schema: { examples: Pointer[] } };

  return (text: string): Pointer =>
    examplePointers
      .find(pointer => JSON.stringify(pointer).includes(text))!;
})();
