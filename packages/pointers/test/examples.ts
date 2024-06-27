import { describeSchema } from "@ethdebug/format";

import type { Pointer } from "../src/pointer.js";
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

export const prepareCompileOptions = (example: {
  path: string;
  contractName: string;
  content: string;
}): CompileOptions => {
  const { path, contractName, content: contentWithoutHeader } = example;

  const spdxLicenseIdentifier = "// SPDX-License-Identifier: UNLICENSED";
  const pragma = "pragma solidity ^0.8.25;";
  const header = `${spdxLicenseIdentifier}
${pragma}
`;

  return {
    sources: {
      [path]: {
        content: `${header}
${contentWithoutHeader}
`
      }
    },

    target: {
      path,
      contractName
    }
  };
}
