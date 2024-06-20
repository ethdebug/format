import { type CompileOptions } from "./solc.js";

export const examples = {
  emptyContract: makeExample({
    path: "EmptyContract.sol",
    contractName: "EmptyContract",
    content: `contract EmptyContract {
}
`,
  }),

  stringStorage: makeExample({
    path: "StringStorage.sol",
    contractName: "StringStorage",
    content: `contract StringStorage {
  string storedString;
  bool done;

  event Done();

  constructor() {
    storedString = "hello world";
    storedString = "solidity storage is a fun lesson in endianness";

    done = true;
  }
}
`,
  }),
} as const;

export function makeExample(example: {
  path: string;
  contractName: string;
  content: string;
}): CompileOptions {
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
